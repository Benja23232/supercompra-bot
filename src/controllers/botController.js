require('dotenv').config();
const axios = require('axios');
const { enviarMensaje } = require('../services/whatsapp');
const { pool } = require('../services/db'); 
const Tesseract = require('tesseract.js'); // Importamos la IA

const { MercadoPagoConfig, Preference } = require('mercadopago');
const client = new MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN });
const preferenceClient = new Preference(client);

// Memorias temporales
const pedidosEsperandoDireccion = new Map(); 
const pedidosEsperandoTurno = new Map();
const pedidosEsperandoPago = new Map();
const pedidosEsperandoComprobante = new Map(); // NUEVA: Espera la foto del pago

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

        // 1. MANEJO DE MENSAJES DE TEXTO
        if (message.type === 'text') {
            const textoRecibido = message.text.body;

            if (pedidosEsperandoDireccion.has(numeroCliente)) {
                const datosPedido = pedidosEsperandoDireccion.get(numeroCliente);
                await pool.query('UPDATE pedidos SET direccion = $1 WHERE id_pedido = $2', [textoRecibido, datosPedido.idPedido]);

                pedidosEsperandoDireccion.delete(numeroCliente);
                pedidosEsperandoTurno.set(numeroCliente, datosPedido.idPedido);

                const dataBotonesTurno = {
                    messaging_product: "whatsapp",
                    to: numeroCliente,
                    type: "interactive",
                    interactive: {
                        type: "button",
                        body: { text: `📍 ¡Dirección guardada!\n\nSubtotal: $${datosPedido.subtotal}\nEnvío: $${COSTO_ENVIO}\n*Total a abonar: $${datosPedido.total}*\n\n¿En qué turno preferís la entrega?` },
                        action: {
                            buttons: [
                                { type: "reply", reply: { id: "entrega_manana", title: "☀️ Por la Mañana" } },
                                { type: "reply", reply: { id: "entrega_tarde", title: "🌙 Por la Tarde" } }
                            ]
                        }
                    }
                };
                await axios.post(`https://graph.facebook.com/v17.0/${process.env.WHATSAPP_PHONE_ID}/messages`, dataBotonesTurno, { headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}` } });
                return res.sendStatus(200); 
            }

            const mensajeBienvenida = 
                "¡Hola! 👋 Bienvenido a Supercompra.\n\n" +
                "Para ver nuestros productos, tocá el ícono de la tiendita (🏠) que aparece arriba a la derecha. " +
                "¡Armá tu carrito ahí mismo y envialo por acá para confirmar tu pedido!";
            await enviarMensaje(numeroCliente, mensajeBienvenida);
        }

        // 2. MANEJO DE IMÁGENES (Reconocimiento OCR para Comprobantes)
        if (message.type === 'image') {
            if (pedidosEsperandoComprobante.has(numeroCliente)) {
                const datosPago = pedidosEsperandoComprobante.get(numeroCliente);
                await enviarMensaje(numeroCliente, "📸 Comprobante recibido. Estoy analizando la imagen con Inteligencia Artificial para verificar el pago, dame un momento...");

                try {
                    // A. Obtenemos la URL temporal de la imagen desde los servidores de Meta
                    const imageId = message.image.id;
                    const resMedia = await axios.get(`https://graph.facebook.com/v17.0/${imageId}`, { 
                        headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}` } 
                    });
                    
                    // B. Descargamos el archivo binario
                    const responseDescarga = await axios.get(resMedia.data.url, { 
                        responseType: 'arraybuffer', 
                        headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}` } 
                    });
                    const imageBuffer = Buffer.from(responseDescarga.data, 'binary');

                    // C. Usamos Tesseract para extraer el texto de la imagen (en español)
                    const { data: { text } } = await Tesseract.recognize(imageBuffer, 'spa');
                    console.log("Texto extraído del comprobante:", text);

                    // D. Buscamos si el monto exacto aparece en el texto
                    const montoString = String(datosPago.totalEsperado);
                    
                    // Verificamos el monto (buscamos el número con o sin símbolos)
                    if (text.includes(montoString)) {
                        // ¡ÉXITO! La IA encontró el monto. Aprobamos el pedido automáticamente.
                        await pool.query('UPDATE pagos SET estado = $1 WHERE id_pedido = $2', ['Aprobado', datosPago.idPedido]);
                        await pool.query('UPDATE pedidos SET estado = $1 WHERE id_pedido = $2', ['En Preparación', datosPago.idPedido]);
                        
                        pedidosEsperandoComprobante.delete(numeroCliente);
                        await enviarMensaje(numeroCliente, `✅ ¡Pago validado automáticamente con éxito!\n\nEl importe de *$${montoString}* fue confirmado. Tu pedido ya pasó al área de preparación para ser despachado.`);
                    } else {
                        // Falló la validación automática, requiere revisión del dueño en Vercel
                        await enviarMensaje(numeroCliente, `⚠️ No pude validar el monto exacto de *$${montoString}* en la foto del comprobante.\n\nNo te preocupes, un asesor lo revisará manualmente desde el sistema en los próximos minutos para confirmar tu pedido.`);
                        pedidosEsperandoComprobante.delete(numeroCliente);
                    }

                } catch (errorOCR) {
                    console.error("Error analizando imagen:", errorOCR);
                    await enviarMensaje(numeroCliente, "Tuvimos un problema técnico al leer la foto. Un asesor validará tu pago de forma manual en el sistema.");
                    pedidosEsperandoComprobante.delete(numeroCliente);
                }
                return res.sendStatus(200);
            }
        }

        // 3. RECEPCIÓN DEL CARRITO
        if (message.type === 'order') {
            const itemsCatalogo = message.order.product_items;
            try {
                await pool.query(`INSERT INTO clientes (whatsapp_id, nombre) VALUES ($1, $2) ON CONFLICT (whatsapp_id) DO NOTHING`, [numeroCliente, 'Cliente WhatsApp']);
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

                if (detallesParaInsertar.length === 0) return res.sendStatus(200);
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

                pedidosEsperandoDireccion.set(numeroCliente, { idPedido: idNuevoPedido, subtotal: subtotal, total: totalCarrito });
                await enviarMensaje(numeroCliente, "🛒 ¡Recibimos tu pedido y ya lo estamos procesando!\n\nPor favor, *escribinos la dirección* a donde querés que lo enviemos (Calle y número).");

            } catch (errorBD) {
                console.error("Error BD Carrito:", errorBD);
            }
        }

        // 4. CAPTURA DE BOTONES Y LISTAS
        if (message.type === 'interactive') {
            let opcion = message.interactive.type === 'button_reply' ? message.interactive.button_reply.id : message.interactive.list_reply.id;

            if (opcion === 'entrega_manana' || opcion === 'entrega_tarde') {
                const idPedidoAsociado = pedidosEsperandoTurno.get(numeroCliente);
                if (!idPedidoAsociado) return await enviarMensaje(numeroCliente, "La sesión expiró, por favor reenviá tu carrito.");

                let nuevoEstado = opcion === 'entrega_manana' ? 'Pendiente - Mañana' : 'Pendiente - Tarde';
                await pool.query('UPDATE pedidos SET estado = $1 WHERE id_pedido = $2', [nuevoEstado, idPedidoAsociado]);

                pedidosEsperandoTurno.delete(numeroCliente);
                pedidosEsperandoPago.set(numeroCliente, idPedidoAsociado);

                const dataMenuPago = {
                    messaging_product: "whatsapp",
                    to: numeroCliente,
                    type: "interactive",
                    interactive: {
                        type: "list",
                        header: { type: "text", text: "💳 Métodos de Pago" },
                        body: { text: "Perfecto, turno agendado. Por favor elegí cómo preferís abonar tu pedido:" },
                        footer: { text: "Supercompra" },
                        action: {
                            button: "Elegir pago",
                            sections: [
                                {
                                    title: "Opciones disponibles",
                                    rows: [
                                        { id: "pago_mp", title: "Mercado Pago", description: "Acreditación automática" },
                                        { id: "pago_transferencia", title: "Transferencia", description: "Por Alias o CBU" },
                                        { id: "pago_cuenta_dni", title: "Cuenta DNI", description: "Envío de comprobante" },
                                        { id: "pago_cuenta", title: "Cuenta Corriente", description: "Anotar en tu cuenta" }
                                    ]
                                }
                            ]
                        }
                    }
                };
                await axios.post(`https://graph.facebook.com/v17.0/${process.env.WHATSAPP_PHONE_ID}/messages`, dataMenuPago, { headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}` } });
            }

            if (opcion === 'pago_mp' || opcion === 'pago_transferencia' || opcion === 'pago_cuenta_dni' || opcion === 'pago_cuenta') {
                const idPedidoAsociado = pedidosEsperandoPago.get(numeroCliente);
                if (!idPedidoAsociado) return await enviarMensaje(numeroCliente, "Hubo un problema con tu sesión de pago.");

                const resPedido = await pool.query('SELECT total_compra FROM pedidos WHERE id_pedido = $1', [idPedidoAsociado]);
                const totalCompra = resPedido.rows[0].total_compra;

                if (opcion === 'pago_transferencia' || opcion === 'pago_cuenta_dni') {
                    const nombreMetodo = opcion === 'pago_cuenta_dni' ? 'Cuenta DNI' : 'Transferencia';
                    
                    await pool.query(
                        `INSERT INTO pagos (id_pedido, metodo, estado, monto) VALUES ($1, $2, $3, $4)`,
                        [idPedidoAsociado, nombreMetodo, 'Pendiente de Verificación', totalCompra]
                    );
                    pedidosEsperandoPago.delete(numeroCliente);
                    
                    // PASO MAGICO: Lo guardamos en la memoria esperando la foto del comprobante
                    pedidosEsperandoComprobante.set(numeroCliente, { idPedido: idPedidoAsociado, totalEsperado: totalCompra });
                    
                    await enviarMensaje(numeroCliente, `🏦 Elegiste abonar con ${nombreMetodo}.\n\nEl total a transferir es *$${totalCompra}*.\n\n*Datos bancarios:*\nAlias: *super.compra.ok*\nCBU/CVU: 0000000000000000000000\n\nPor favor, *envianos la foto del comprobante* por este mismo chat para validarlo automáticamente.`);

                } else if (opcion === 'pago_cuenta') {
                    await pool.query(
                        `INSERT INTO pagos (id_pedido, metodo, estado, monto) VALUES ($1, $2, $3, $4)`,
                        [idPedidoAsociado, 'Cuenta Corriente', 'Pendiente de Aprobación', totalCompra]
                    );
                    pedidosEsperandoPago.delete(numeroCliente);
                    await enviarMensaje(numeroCliente, `📝 Registramos tu solicitud para anotar el pedido por *$${totalCompra}*.\n\nEn breve verificaremos tu cuenta. ¡Gracias!`);

                } else if (opcion === 'pago_mp') {
                    try {
                        const responsePreference = await preferenceClient.create({
                            body: {
                                items: [{ id: String(idPedidoAsociado), title: 'Pedido Supercompra', quantity: 1, unit_price: parseFloat(totalCompra) }],
                                back_urls: { success: `${process.env.SERVER_URL}/pago-exitoso` },
                                auto_return: 'approved',
                                notification_url: `${process.env.SERVER_URL}/mercadopago-webhook`, 
                                external_reference: String(idPedidoAsociado) 
                            }
                        });

                        await pool.query(`INSERT INTO pagos (id_pedido, metodo, estado, transaccion_id, monto) VALUES ($1, $2, $3, $4, $5)`, [idPedidoAsociado, 'Mercado Pago', 'Pendiente', responsePreference.id, totalCompra]);
                        pedidosEsperandoPago.delete(numeroCliente);
                        await enviarMensaje(numeroCliente, `💳 Generamos tu link de pago seguro por *$${totalCompra}*.\nHacé clic acá:\n${responsePreference.init_point}`);
                    } catch (errorMP) {
                        console.error("Error MP:", errorMP);
                    }
                }
            }
        }
        
        res.sendStatus(200);
    } catch (e) {
        console.error('Error general webhook:', e);
        res.sendStatus(200);
    }
};

module.exports = { verificarToken, recibirMensaje };