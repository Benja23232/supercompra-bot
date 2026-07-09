require('dotenv').config();
const axios = require('axios');
const { enviarMensaje } = require('../services/whatsapp');
const { pool } = require('../services/db'); 

// Importamos el SDK moderno de Mercado Pago
const { MercadoPagoConfig, Preference } = require('mercadopago');
const client = new MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN });
const preferenceClient = new Preference(client);

// Memorias temporales para guiar el flujo del cliente
const pedidosEsperandoTurno = new Map();
const pedidosEsperandoPago = new Map();

// Definimos el costo fijo de envío
const COSTO_ENVIO = 4000;

const verificarToken = (req, res) => {
    const verify_token = process.env.WHATSAPP_VERIFY_TOKEN;
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode === 'subscribe' && token === verify_token) {
        res.status(200).send(challenge);
    } else {
        res.status(403).send('Token de verificación incorrecto');
    }
};

const recibirMensaje = async (req, res) => {
    try {
        const message = req.body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
        if (!message) return res.sendStatus(200);

        let numeroCliente = message.from.startsWith("549") ? message.from.replace("549", "54") : message.from;

        // 1. BIENVENIDA
        if (message.type === 'text') {
            const mensajeBienvenida = 
                "¡Hola! 👋 Bienvenido a Supercompra.\n\n" +
                "Para ver nuestros productos, tocá el ícono de la tiendita (🏠) que aparece arriba a la derecha. " +
                "¡Armá tu carrito ahí mismo y envialo por acá para confirmar tu pedido!";
            await enviarMensaje(numeroCliente, mensajeBienvenida);
        }

        // 2. RECEPCIÓN DEL CARRITO VISUAL (Meta envía tipo 'order')
        if (message.type === 'order') {
            const itemsCatalogo = message.order.product_items;

            try {
                await pool.query(
                    `INSERT INTO clientes (whatsapp_id, nombre) VALUES ($1, $2) ON CONFLICT (whatsapp_id) DO NOTHING`,
                    [numeroCliente, 'Cliente WhatsApp']
                );

                let subtotal = 0;
                const detallesParaInsertar = [];
                
                for (let item of itemsCatalogo) {
                    const idProductoMeta = item.product_retailer_id; 
                    const quantity = item.quantity;
                    
                    const resProd = await pool.query('SELECT precio FROM productos WHERE id_producto = $1', [idProductoMeta]);
                    
                    if (resProd.rows.length > 0) {
                        const precioActual = resProd.rows[0].precio;
                        subtotal += (precioActual * quantity);
                        detallesParaInsertar.push({ id: idProductoMeta, cantidad: quantity, precio: precioActual });
                    }
                }

                if (detallesParaInsertar.length === 0) {
                    await enviarMensaje(numeroCliente, "Hubo un problema procesando los productos de tu carrito. Verificá disponibilidad.");
                    return res.sendStatus(200);
                }

                // Sumamos el costo de envío al subtotal de los productos
                const totalCarrito = subtotal + COSTO_ENVIO;

                const resPedido = await pool.query(
                    `INSERT INTO pedidos (whatsapp_id, estado, total_compra) VALUES ($1, $2, $3) RETURNING id_pedido`,
                    [numeroCliente, 'Pendiente', totalCarrito]
                );
                const idNuevoPedido = resPedido.rows[0].id_pedido;

                for (let detalle of detallesParaInsertar) {
                    await pool.query(
                        `INSERT INTO detalle_pedidos (id_pedido, id_producto, cantidad, precio_congelado) VALUES ($1, $2, $3, $4)`,
                        [idNuevoPedido, detalle.id, detalle.cantidad, detalle.precio]
                    );
                }

                // Guardamos en memoria para el paso del turno
                pedidosEsperandoTurno.set(numeroCliente, idNuevoPedido);

                // Botones de Turno con el desglose de precios
                const dataBotonesTurno = {
                    messaging_product: "whatsapp",
                    to: numeroCliente,
                    type: "interactive",
                    interactive: {
                        type: "button",
                        body: { text: `🛒 ¡Recibimos tu pedido!\n\nSubtotal: $${subtotal}\nEnvío: $${COSTO_ENVIO}\n*Total a abonar: $${totalCarrito}*\n\n¿En qué turno preferís la entrega?` },
                        action: {
                            buttons: [
                                { type: "reply", reply: { id: "entrega_manana", title: "☀️ Por la Mañana" } },
                                { type: "reply", reply: { id: "entrega_tarde", title: "🌙 Por la Tarde" } }
                            ]
                        }
                    }
                };
                await axios.post(`https://graph.facebook.com/v17.0/${process.env.WHATSAPP_PHONE_ID}/messages`, dataBotonesTurno, { headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}` } });

            } catch (errorBD) {
                console.error("❌ Error BD Carrito:", errorBD);
                await enviarMensaje(numeroCliente, "Hubo un error al registrar tu carrito.");
            }
        }

        // 3. CAPTURA DE BOTONES (Turnos y Pagos)
        if (message.type === 'interactive' && message.interactive.type === 'button_reply') {
            const opcion = message.interactive.button_reply.id;

            // --- FLUJO A: EL CLIENTE ELIGIÓ EL TURNO ---
            if (opcion === 'entrega_manana' || opcion === 'entrega_tarde') {
                const idPedidoAsociado = pedidosEsperandoTurno.get(numeroCliente);
                if (!idPedidoAsociado) return await enviarMensaje(numeroCliente, "La sesión expiró, por favor reenviá tu carrito.");

                let nuevoEstado = opcion === 'entrega_manana' ? 'Pendiente - Mañana' : 'Pendiente - Tarde';
                await pool.query('UPDATE pedidos SET estado = $1 WHERE id_pedido = $2', [nuevoEstado, idPedidoAsociado]);

                // Pasamos el pedido a la memoria de espera de pago
                pedidosEsperandoTurno.delete(numeroCliente);
                pedidosEsperandoPago.set(numeroCliente, idPedidoAsociado);

                // Mandamos botones de método de pago
                const dataBotonesPago = {
                    messaging_product: "whatsapp",
                    to: numeroCliente,
                    type: "interactive",
                    interactive: {
                        type: "button",
                        body: { text: "Perfecto turno agendado. ¿Cómo preferís realizar el pago?" },
                        action: {
                            buttons: [
                                { type: "reply", reply: { id: "pago_mp", title: "💳 Mercado Pago" } },
                                { type: "reply", reply: { id: "pago_efectivo", title: "💵 En Efectivo" } }
                            ]
                        }
                    }
                };
                await axios.post(`https://graph.facebook.com/v17.0/${process.env.WHATSAPP_PHONE_ID}/messages`, dataBotonesPago, { headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}` } });
            }

            // --- FLUJO B: EL CLIENTE ELIGIÓ EL MÉTODO DE PAGO ---
            if (opcion === 'pago_mp' || opcion === 'pago_efectivo') {
                const idPedidoAsociado = pedidosEsperandoPago.get(numeroCliente);
                if (!idPedidoAsociado) return await enviarMensaje(numeroCliente, "Hubo un problema con tu sesión de pago.");

                // Buscamos el monto total del pedido para procesar el pago correctamente
                const resPedido = await pool.query('SELECT total_compra FROM pedidos WHERE id_pedido = $1', [idPedidoAsociado]);
                const totalCompra = resPedido.rows[0].total_compra;

                if (opcion === 'pago_efectivo') {
                    await pool.query(
                        `INSERT INTO pagos (id_pedido, metodo, estado, monto) VALUES ($1, $2, $3, $4)`,
                        [idPedidoAsociado, 'Efectivo', 'Pendiente', totalCompra]
                    );

                    pedidosEsperandoPago.delete(numeroCliente);
                    await enviarMensaje(numeroCliente, `✅ ¡Pedido confirmado! Vas a abonar *$${totalCompra}* en efectivo al momento de la entrega. ¡Muchas gracias por tu compra!`);
                
                } else if (opcion === 'pago_mp') {
                    try {
                        const responsePreference = await preferenceClient.create({
                            body: {
                                items: [{
                                    id: String(idPedidoAsociado),
                                    title: 'Pedido Supercompra (Incluye envío)',
                                    quantity: 1,
                                    unit_price: parseFloat(totalCompra)
                                }],
                                back_urls: {
                                    success: `${process.env.SERVER_URL}/pago-exitoso`,
                                },
                                auto_return: 'approved',
                                notification_url: `${process.env.SERVER_URL}/mercadopago-webhook`, 
                                external_reference: String(idPedidoAsociado) 
                            }
                        });

                        await pool.query(
                            `INSERT INTO pagos (id_pedido, metodo, estado, transaccion_id, monto) VALUES ($1, $2, $3, $4, $5)`,
                            [idPedidoAsociado, 'Mercado Pago', 'Pendiente', responsePreference.id, totalCompra]
                        );

                        pedidosEsperandoPago.delete(numeroCliente);

                        await enviarMensaje(numeroCliente, `💳 Generamos tu link de pago seguro por *$${totalCompra}*.\n\nHacé clic acá para pagar:\n${responsePreference.init_point}\n\nUna vez realizado, el sistema registrará tu pago de forma automática.`);

                    } catch (errorMP) {
                        console.error("❌ Error creando preferencia MP:", errorMP);
                        await enviarMensaje(numeroCliente, "Tuvimos un problema técnico al generar el link de Mercado Pago. Por favor, coordiná el pago en efectivo.");
                    }
                }
            }
        }
        
        res.sendStatus(200);
    } catch (e) {
        console.error('❌ Error general webhook:', e);
        res.sendStatus(200);
    }
};

module.exports = { verificarToken, recibirMensaje };