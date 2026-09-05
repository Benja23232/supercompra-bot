require('dotenv').config();
const axios = require('axios');
const { enviarMensaje } = require('../services/whatsapp');
const { pool } = require('../services/db'); 
const Tesseract = require('tesseract.js'); 

const { MercadoPagoConfig, Preference } = require('mercadopago');
const client = new MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN });
const preferenceClient = new Preference(client);

const pedidosEsperandoDireccion = new Map(); 
const pedidosEsperandoTurno = new Map();
const pedidosEsperandoPago = new Map();
const pedidosEsperandoComprobante = new Map(); 

// Memoria anti-duplicados para evitar que Meta procese dos veces el mismo mensaje si el servidor se demora
const mensajesProcesados = new Set(); 

const COSTO_ENVIO = 4000;
const COSTO_FULL = 1000;

// Función auxiliar para generar y enviar la factura en PDF llamando a la API de Next.js
async function dispararEnvioFactura(idPedido, numeroCliente) {
    try {
        const resPedido = await pool.query(`
            SELECT p.id_pedido, p.total_compra, c.nombre as cliente_nombre 
            FROM pedidos p 
            JOIN clientes c ON p.whatsapp_id = c.whatsapp_id 
            WHERE p.id_pedido = $1
        `, [idPedido]);

        const pedidoData = resPedido.rows[0] || (await pool.query('SELECT * FROM pedidos WHERE id_pedido = $1', [idPedido])).rows[0];
        if (!pedidoData) return;

        const resDetalles = await pool.query(`
            SELECT d.cantidad, d.precio_congelado as precio_unitario, pr.nombre 
            FROM detalle_pedidos d 
            JOIN productos pr ON d.id_producto = pr.id_producto 
            WHERE d.id_pedido = $1
        `, [idPedido]);

        const productosFormateados = resDetalles.rows.map(row => ({
            cantidad: row.cantidad,
            nombre: row.nombre,
            precio_unitario: row.precio_unitario
        }));

        const baseUrl = process.env.SERVER_URL || 'http://localhost:3000';
        
        await axios.post(`${baseUrl}/api/factura`, {
            cliente_telefono: numeroCliente,
            cliente_nombre: pedidoData.cliente_nombre || 'Consumidor Final',
            id_pedido: idPedido,
            total: pedidoData.total_compra,
            productos: productosFormateados
        });
    } catch (errFactura) {
        console.error("Error al disparar el envío automático de factura:", errFactura);
    }
}

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

        // --- FILTRO ANTI-DUPLICADOS (IDEMPOTENCIA) ---
        // Si Meta reenvía el mismo mensaje porque tardamos en responder, lo ignoramos de inmediato
        if (mensajesProcesados.has(message.id)) {
            console.log(`⚠️ Mensaje duplicado detectado de Meta (ID: ${message.id}). Omitiendo...`);
            return res.sendStatus(200);
        }
        mensajesProcesados.add(message.id);
        
        // Limpiamos la memoria periódicamente para que no crezca infinitamente
        if (mensajesProcesados.size > 500) mensajesProcesados.clear();
        // ---------------------------------------------

        let numeroCliente = message.from.startsWith("549") ? message.from.replace("549", "54") : message.from;

        // --- MANEJO DE UBICACIÓN (GPS WHATSAPP) ---
        if (message.type === 'location') {
            if (pedidosEsperandoDireccion.has(numeroCliente)) {
                const lat = message.location.latitude;
                const lng = message.location.longitude;
                const direccionGPS = `https://maps.google.com/?q=${lat},${lng}`;

                const datosPedido = pedidosEsperandoDireccion.get(numeroCliente);
                await pool.query('UPDATE pedidos SET direccion = $1 WHERE id_pedido = $2', [direccionGPS, datosPedido.idPedido]);

                pedidosEsperandoDireccion.delete(numeroCliente);
                pedidosEsperandoTurno.set(numeroCliente, datosPedido.idPedido);

                const dataBotonesTurno = {
                    messaging_product: "whatsapp",
                    to: numeroCliente,
                    type: "interactive",
                    interactive: {
                        type: "button",
                        body: { text: `📍 ¡Ubicación GPS guardada con éxito!\n\nSubtotal: $${datosPedido.subtotal}\nEnvío estándar: $${COSTO_ENVIO}\n*Total a abonar: $${datosPedido.total}*\n\n¿En qué turno preferís la entrega?` },
                        action: {
                            buttons: [
                                { type: "reply", reply: { id: "entrega_manana", title: "☀️ Mañana" } },
                                { type: "reply", reply: { id: "entrega_tarde", title: "🌙 Tarde" } },
                                { type: "reply", reply: { id: "envio_full", title: "🚀 Full (+$1000)" } }
                            ]
                        }
                    }
                };
                await axios.post(`https://graph.facebook.com/v17.0/${process.env.WHATSAPP_PHONE_ID}/messages`, dataBotonesTurno, { headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}` } });
                return res.sendStatus(200);
            }
        }

        // 1. MANEJO DE MENSAJES DE TEXTO
        if (message.type === 'text') {
            const textoRecibido = message.text.body;

            if (pedidosEsperandoDireccion.has(numeroCliente)) {
                let direccionMejorada = textoRecibido.trim();
                
                if (!direccionMejorada.toLowerCase().includes('tres lomas')) {
                    direccionMejorada = `${direccionMejorada}, Tres Lomas`;
                }

                const datosPedido = pedidosEsperandoDireccion.get(numeroCliente);
                await pool.query('UPDATE pedidos SET direccion = $1 WHERE id_pedido = $2', [direccionMejorada, datosPedido.idPedido]);

                pedidosEsperandoDireccion.delete(numeroCliente);
                pedidosEsperandoTurno.set(numeroCliente, datosPedido.idPedido);

                const dataBotonesTurno = {
                    messaging_product: "whatsapp",
                    to: numeroCliente,
                    type: "interactive",
                    interactive: {
                        type: "button",
                        body: { text: `📍 ¡Dirección guardada! (${direccionMejorada})\n\nSubtotal: $${datosPedido.subtotal}\nEnvío estándar: $${COSTO_ENVIO}\n*Total a abonar: $${datosPedido.total}*\n\n¿En qué turno preferís la entrega?` },
                        action: {
                            buttons: [
                                { type: "reply", reply: { id: "entrega_manana", title: "☀️ Mañana" } },
                                { type: "reply", reply: { id: "entrega_tarde", title: "🌙 Tarde" } },
                                { type: "reply", reply: { id: "envio_full", title: "🚀 Full (+$1000)" } }
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

        // 2. MANEJO DE IMÁGENES (OCR)
        if (message.type === 'image') {
            if (pedidosEsperandoComprobante.has(numeroCliente)) {
                const datosPago = pedidosEsperandoComprobante.get(numeroCliente);
                await enviarMensaje(numeroCliente, "📸 Comprobante recibido. Estoy analizando la imagen con Inteligencia Artificial para verificar el pago, dame un momento...");

                try {
                    const imageId = message.image.id;
                    const resMedia = await axios.get(`https://graph.facebook.com/v17.0/${imageId}`, { 
                        headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}` } 
                    });
                    
                    const responseDescarga = await axios.get(resMedia.data.url, { 
                        responseType: 'arraybuffer', 
                        headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}` } 
                    });
                    const imageBuffer = Buffer.from(responseDescarga.data, 'binary');

                    const { data: { text } } = await Tesseract.recognize(imageBuffer, 'spa');
                    const montoString = String(datosPago.totalEsperado);
                    
                    if (text.includes(montoString)) {
                        await pool.query('UPDATE pagos SET estado = $1 WHERE id_pedido = $2', ['Aprobado', datosPago.idPedido]);
                        await pool.query('UPDATE pedidos SET estado = $1 WHERE id_pedido = $2', ['En Preparación', datosPago.idPedido]);
                        
                        pedidosEsperandoComprobante.delete(numeroCliente);
                        await enviarMensaje(numeroCliente, `✅ ¡Pago validado automáticamente con éxito!\n\nEl importe de *$${montoString}* fue confirmado. Tu pedido ya pasó al área de preparación para ser despachado.`);
                        
                        await dispararEnvioFactura(datosPago.idPedido, numeroCliente);

                    } else {
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

        // 3. RECEPCIÓN DEL CARRITO (CON VALIDACIÓN DE STOCK)
        if (message.type === 'order') {
            const itemsCatalogo = message.order.product_items;
            try {
                let hayProblemasDeStock = false;
                let mensajeStockFaltante = "¡Hola! Revisamos tu pedido y tenemos un problema con el stock actual de estos productos:\n\n";
                let subtotal = 0;
                const detallesParaInsertar = [];
                
                for (let item of itemsCatalogo) {
                    const idProductoMeta = item.product_retailer_id; 
                    const quantity = item.quantity;
                    
                    const resProd = await pool.query('SELECT nombre, precio, stock_fisico FROM productos WHERE id_producto = $1', [idProductoMeta]);
                    
                    if (resProd.rows.length > 0) {
                        const producto = resProd.rows[0];
                        const precioActual = producto.precio;
                        const stockActual = producto.stock_fisico || 0;
                        const nombreProd = producto.nombre;

                        if (stockActual <= 0) {
                            mensajeStockFaltante += `❌ *${nombreProd}*: No tenemos stock en este momento.\n`;
                            hayProblemasDeStock = true;
                        } else if (stockActual < quantity) {
                            mensajeStockFaltante += `⚠️ *${nombreProd}*: Solo nos quedan ${stockActual} unidades (pediste ${quantity}).\n`;
                            hayProblemasDeStock = true;
                        } else {
                            subtotal += (precioActual * quantity);
                            detallesParaInsertar.push({ id: idProductoMeta, cantidad: quantity, precio: precioActual });
                        }
                    } else {
                        mensajeStockFaltante += `❌ Producto no encontrado en nuestro sistema.\n`;
                        hayProblemasDeStock = true;
                    }
                }

                if (hayProblemasDeStock) {
                    mensajeStockFaltante += "\nPor favor, ingresá nuevamente al catálogo y armá tu carrito ajustando las cantidades. ¡Perdón por las molestias! 🙏";
                    await enviarMensaje(numeroCliente, mensajeStockFaltante);
                    return res.sendStatus(200);
                }

                await pool.query(`INSERT INTO clientes (whatsapp_id, nombre) VALUES ($1, $2) ON CONFLICT (whatsapp_id) DO NOTHING`, [numeroCliente, 'Cliente WhatsApp']);
                
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
                
                await enviarMensaje(numeroCliente, "🛒 ¡Recibimos tu pedido y verificamos que hay stock de todo!\n\nPara el envío, podés hacer dos cosas:\n1️⃣ *Escribirnos la dirección* (Ej: Belgrano 1024)\n2️⃣ Tocar el 📎 (clip) abajo y enviarnos tu *Ubicación actual* de WhatsApp para mayor precisión.");

            } catch (errorBD) {
                console.error("Error BD Carrito:", errorBD);
            }
        }

        // 4. CAPTURA DE BOTONES Y LISTAS
        if (message.type === 'interactive') {
            let opcion = message.interactive.type === 'button_reply' ? message.interactive.button_reply.id : message.interactive.list_reply.id;

            if (opcion === 'entrega_manana' || opcion === 'entrega_tarde' || opcion === 'envio_full') {
                const idPedidoAsociado = pedidosEsperandoTurno.get(numeroCliente);
                if (!idPedidoAsociado) return await enviarMensaje(numeroCliente, "La sesión expiró, por favor reenviá tu carrito.");

                let nuevoEstado = '';
                let recargoExtra = 0;

                if (opcion === 'entrega_manana') {
                    nuevoEstado = 'Pendiente - Mañana';
                } else if (opcion === 'entrega_tarde') {
                    nuevoEstado = 'Pendiente - Tarde';
                } else if (opcion === 'envio_full') {
                    nuevoEstado = 'Pendiente - Full';
                    recargoExtra = COSTO_FULL; 
                }

                if (recargoExtra > 0) {
                    await pool.query('UPDATE pedidos SET estado = $1, total_compra = total_compra + $2 WHERE id_pedido = $3', [nuevoEstado, recargoExtra, idPedidoAsociado]);
                } else {
                    await pool.query('UPDATE pedidos SET estado = $1 WHERE id_pedido = $2', [nuevoEstado, idPedidoAsociado]);
                }

                const resTotal = await pool.query('SELECT total_compra FROM pedidos WHERE id_pedido = $1', [idPedidoAsociado]);
                const totalActualizado = resTotal.rows[0].total_compra;

                pedidosEsperandoTurno.delete(numeroCliente);
                pedidosEsperandoPago.set(numeroCliente, idPedidoAsociado);

                const dataMenuPago = {
                    messaging_product: "whatsapp",
                    to: numeroCliente,
                    type: "interactive",
                    interactive: {
                        type: "list",
                        header: { type: "text", text: "💳 Métodos de Pago" },
                        body: { text: `Turno agendado. El total de tu pedido es *$${totalActualizado}*.\n\nPor favor elegí cómo preferís abonarlo:` },
                        footer: { text: "Supercompra" },
                        action: {
                            button: "Elegir pago",
                            sections: [
                                {
                                    title: "Opciones disponibles",
                                    rows: [
                                        { id: "pago_mp", title: "Mercado Pago", description: "Acreditación automática" },
                                        { id: "pago_tarjeta_pampa", title: "Tarjeta Bco Pampa", description: "Llevamos el posnet" },
                                        { id: "pago_transferencia", title: "Transferencia", description: "Por Alias o CBU" },
                                        { id: "pago_cuenta_dni", title: "Cuenta DNI", description: "Envío de comprobante" },
                                        { id: "pago_efectivo", title: "Efectivo", description: "Pagás al recibir" }
                                    ]
                                }
                            ]
                        }
                    }
                };
                await axios.post(`https://graph.facebook.com/v17.0/${process.env.WHATSAPP_PHONE_ID}/messages`, dataMenuPago, { headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}` } });
            }

            // --- ACÁ EVALUAMOS LA RESPUESTA DE PAGO ---
            if (opcion === 'pago_mp' || opcion === 'pago_transferencia' || opcion === 'pago_cuenta_dni' || opcion === 'pago_efectivo' || opcion === 'pago_tarjeta_pampa') {
                const idPedidoAsociado = pedidosEsperandoPago.get(numeroCliente);
                if (!idPedidoAsociado) return await enviarMensaje(numeroCliente, "Hubo un problema con tu sesión de pago.");

                const resPedido = await pool.query('SELECT total_compra FROM pedidos WHERE id_pedido = $1', [idPedidoAsociado]);
                const totalCompra = resPedido.rows[0].total_compra;

                // --- 1. TRANSFERENCIAS CON COMPROBANTE ---
                if (opcion === 'pago_transferencia' || opcion === 'pago_cuenta_dni') {
                    const nombreMetodo = opcion === 'pago_cuenta_dni' ? 'Cuenta DNI' : 'Transferencia';
                    
                    await pool.query(
                        `INSERT INTO pagos (id_pedido, metodo, estado, monto) VALUES ($1, $2, $3, $4)`,
                        [idPedidoAsociado, nombreMetodo, 'Pendiente de Verificación', totalCompra]
                    );
                    pedidosEsperandoPago.delete(numeroCliente);
                    
                    pedidosEsperandoComprobante.set(numeroCliente, { idPedido: idPedidoAsociado, totalEsperado: totalCompra });
                    
                    await enviarMensaje(numeroCliente, `🏦 Elegiste abonar con ${nombreMetodo}.\n\nEl total a transferir es *$${totalCompra}*.\n\n*Datos bancarios:*\nAlias: *super.compra.ok*\nCBU/CVU: 0000000000000000000000\n\nPor favor, *envianos la foto del comprobante* por este mismo chat para validarlo automáticamente.`);

                // --- 2. TARJETA BANCO PAMPA (POSNET) ---
                } else if (opcion === 'pago_tarjeta_pampa') {
                    await pool.query(
                        `INSERT INTO pagos (id_pedido, metodo, estado, monto) VALUES ($1, $2, $3, $4)`,
                        [idPedidoAsociado, 'Tarjeta Bco Pampa', 'A Cobrar (Posnet)', totalCompra]
                    );
                    
                    await pool.query('UPDATE pedidos SET estado = $1 WHERE id_pedido = $2', ['En Preparación', idPedidoAsociado]);
                    
                    pedidosEsperandoPago.delete(numeroCliente);
                    
                    await enviarMensaje(numeroCliente, `💳 ¡Perfecto! Registramos tu pago con *Tarjeta del Banco Pampa*.\n\nEl total es *$${totalCompra}*.\n\nEl repartidor llevará el posnet/lector para que puedas abonar con tu tarjeta al momento de recibir el pedido. ¡Ya lo estamos preparando!`);
                    
                    await dispararEnvioFactura(idPedidoAsociado, numeroCliente);

                // --- 3. EFECTIVO ---
                } else if (opcion === 'pago_efectivo') {
                    await pool.query(
                        `INSERT INTO pagos (id_pedido, metodo, estado, monto) VALUES ($1, $2, $3, $4)`,
                        [idPedidoAsociado, 'Efectivo', 'A Cobrar (Efectivo)', totalCompra]
                    );
                    
                    await pool.query('UPDATE pedidos SET estado = $1 WHERE id_pedido = $2', ['En Preparación', idPedidoAsociado]);
                    
                    pedidosEsperandoPago.delete(numeroCliente);
                    
                    await enviarMensaje(numeroCliente, `💵 ¡Excelente! Registramos tu pedido para pagar en efectivo al recibir.\n\nTené preparados *$${totalCompra}*.\n\nYa pasamos tu pedido al área de preparación para armarlo.`);
                    
                    await dispararEnvioFactura(idPedidoAsociado, numeroCliente);

                // --- 4. MERCADO PAGO ---
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