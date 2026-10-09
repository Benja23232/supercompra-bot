require('dotenv').config();
const axios = require('axios');
const { enviarMensaje } = require('../services/whatsapp');
const { pool } = require('../services/db'); 
const Tesseract = require('tesseract.js'); 

const { MercadoPagoConfig, Preference } = require('mercadopago');
const client = new MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN });
const preferenceClient = new Preference(client);

// --- MEMORIAS Y ESTADOS DE SESIÓN ---
const carritosActivos = new Map();          // numeroCliente -> [{ id_producto, nombre, precio, cantidad }]
const productosMostrados = new Map();       // numeroCliente -> [ array de productos de la última categoría vista ]
const pedidosEsperandoDireccion = new Map(); 
const pedidosEsperandoTurno = new Map();
const pedidosEsperandoPago = new Map();
const pedidosEsperandoComprobante = new Map(); 

// Memoria anti-duplicados
const mensajesProcesados = new Set(); 

const COSTO_FULL = 1500;
const MINIMO_ENVIO_GRATIS = 40000;

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

        // --- FILTRO ANTI-DUPLICADOS ---
        if (mensajesProcesados.has(message.id)) return res.sendStatus(200);
        mensajesProcesados.add(message.id);
        if (mensajesProcesados.size > 500) mensajesProcesados.clear();

        let numeroCliente = message.from.startsWith("549") ? message.from.replace("549", "54") : message.from;

        // --- MANEJO DE UBICACIÓN (GPS) ---
        if (message.type === 'location') {
            if (pedidosEsperandoDireccion.has(numeroCliente)) {
                const lat = message.location.latitude;
                const lng = message.location.longitude;
                const direccionGPS = `https://maps.google.com/?q=${lat},${lng}`;

                const datosPedido = pedidosEsperandoDireccion.get(numeroCliente);
                await pool.query('UPDATE pedidos SET direccion = $1 WHERE id_pedido = $2', [direccionGPS, datosPedido.idPedido]);

                pedidosEsperandoDireccion.delete(numeroCliente);
                pedidosEsperandoTurno.set(numeroCliente, datosPedido.idPedido);

                const textoBotonFull = datosPedido.subtotal >= MINIMO_ENVIO_GRATIS ? "🚀 Full (GRATIS)" : `🚀 Full (+$${COSTO_FULL})`;

                const dataBotonesTurno = {
                    messaging_product: "whatsapp",
                    to: numeroCliente,
                    type: "interactive",
                    interactive: {
                        type: "button",
                        body: { text: `📍 ¡Ubicación GPS guardada!\n\nSubtotal: $${datosPedido.subtotal}\nEnvío Mañana/Tarde: ¡GRATIS! 🎁\n\n¿En qué turno preferís la entrega?` },
                        action: {
                            buttons: [
                                { type: "reply", reply: { id: "entrega_manana", title: "☀️ Mañana" } },
                                { type: "reply", reply: { id: "entrega_tarde", title: "🌙 Tarde" } },
                                { type: "reply", reply: { id: "envio_full", title: textoBotonFull } }
                            ]
                        }
                    }
                };
                await axios.post(`https://graph.facebook.com/v17.0/${process.env.WHATSAPP_PHONE_ID}/messages`, dataBotonesTurno, { headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}` } });
                return res.sendStatus(200);
            }
        }

        // --- MANEJO DE IMÁGENES (OCR COMPROBANTES) ---
        if (message.type === 'image') {
            if (pedidosEsperandoComprobante.has(numeroCliente)) {
                const datosPago = pedidosEsperandoComprobante.get(numeroCliente);
                await enviarMensaje(numeroCliente, "📸 Comprobante recibido. Analizando pago con IA...");

                try {
                    const imageId = message.image.id;
                    const resMedia = await axios.get(`https://graph.facebook.com/v17.0/${imageId}`, { headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}` } });
                    const responseDescarga = await axios.get(resMedia.data.url, { responseType: 'arraybuffer', headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}` } });
                    const imageBuffer = Buffer.from(responseDescarga.data, 'binary');

                    const { data: { text } } = await Tesseract.recognize(imageBuffer, 'spa');
                    const montoString = String(datosPago.totalEsperado);
                    
                    if (text.includes(montoString)) {
                        await pool.query('UPDATE pagos SET estado = $1 WHERE id_pedido = $2', ['Aprobado', datosPago.idPedido]);
                        await pool.query('UPDATE pedidos SET estado = $1 WHERE id_pedido = $2', ['En Preparación', datosPago.idPedido]);
                        pedidosEsperandoComprobante.delete(numeroCliente);
                        await enviarMensaje(numeroCliente, `✅ ¡Pago validado con éxito!\n\nImporte de *$${montoString}* confirmado. Pedido en preparación.`);
                        await dispararEnvioFactura(datosPago.idPedido, numeroCliente);
                    } else {
                        await enviarMensaje(numeroCliente, `⚠️ No pude validar el monto exacto de *$${montoString}* en la foto. Un asesor lo revisará manualmente.`);
                        pedidosEsperandoComprobante.delete(numeroCliente);
                    }
                } catch (errorOCR) {
                    console.error("Error OCR:", errorOCR);
                    await enviarMensaje(numeroCliente, "Error al leer la foto. Un asesor validará el pago manualmente.");
                    pedidosEsperandoComprobante.delete(numeroCliente);
                }
                return res.sendStatus(200);
            }
        }

        // --- MANEJO DE MENSAJES DE TEXTO Y COMANDOS ---
        if (message.type === 'text') {
            const textoRecibido = message.text.body.trim();
            const textoLower = textoRecibido.toLowerCase();

            // 1. Si está esperando dirección
            if (pedidosEsperandoDireccion.has(numeroCliente)) {
                let direccionMejorada = textoRecibido;
                if (!direccionMejorada.toLowerCase().includes('tres lomas')) {
                    direccionMejorada = `${direccionMejorada}, Tres Lomas`;
                }

                const datosPedido = pedidosEsperandoDireccion.get(numeroCliente);
                await pool.query('UPDATE pedidos SET direccion = $1 WHERE id_pedido = $2', [direccionMejorada, datosPedido.idPedido]);

                pedidosEsperandoDireccion.delete(numeroCliente);
                pedidosEsperandoTurno.set(numeroCliente, datosPedido.idPedido);

                const textoBotonFull = datosPedido.subtotal >= MINIMO_ENVIO_GRATIS ? "🚀 Full (GRATIS)" : `🚀 Full (+$${COSTO_FULL})`;

                const dataBotonesTurno = {
                    messaging_product: "whatsapp",
                    to: numeroCliente,
                    type: "interactive",
                    interactive: {
                        type: "button",
                        body: { text: `📍 ¡Dirección guardada! (${direccionMejorada})\n\nSubtotal: $${datosPedido.subtotal}\nEnvío Mañana/Tarde: ¡GRATIS! 🎁\n\n¿En qué turno preferís la entrega?` },
                        action: {
                            buttons: [
                                { type: "reply", reply: { id: "entrega_manana", title: "☀️ Mañana" } },
                                { type: "reply", reply: { id: "entrega_tarde", title: "🌙 Tarde" } },
                                { type: "reply", reply: { id: "envio_full", title: textoBotonFull } }
                            ]
                        }
                    }
                };
                await axios.post(`https://graph.facebook.com/v17.0/${process.env.WHATSAPP_PHONE_ID}/messages`, dataBotonesTurno, { headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}` } });
                return res.sendStatus(200); 
            }

            // 2. Comando: VER CARRITO
            if (textoLower === 'carrito' || textoLower === 'ver carrito') {
                const carrito = carritosActivos.get(numeroCliente) || [];
                if (carrito.length === 0) {
                    await enviarMensaje(numeroCliente, "🛒 Tu carrito está vacío.\n\nEscribí *menu* o *categorias* para ver las góndolas.");
                } else {
                    let mensajeCarrito = "🛒 *Tu Carrito Actual:*\n\n";
                    let total = 0;
                    carrito.forEach((item, index) => {
                        const subtotalItem = item.precio * item.cantidad;
                        total += subtotalItem;
                        mensajeSesion = `${index + 1}. *${item.nombre}* x${item.cantidad} - $${subtotalItem}\n`;
                        mensajeCarrito += mensajeSesion;
                    });
                    mensajeCarrito += `\n*Total estimado: $${total}*\n\nPara confirmar y pedir escribí: *finalizar*`;
                    await enviarMensaje(numeroCliente, mensajeCarrito);
                }
                return res.sendStatus(200);
            }

            // 3. Comando: AGREGAR PRODUCTO (Ej: agregar 1 2)
            if (textoLower.startsWith('agregar ')) {
                const partes = textoRecibido.split(' ');
                const indexProd = parseInt(partes[1]) - 1;
                const cantidad = parseInt(partes[2]) || 1;

                const listaUltima = productosMostrados.get(numeroCliente);
                if (!listaUltima || listaUltima.length === 0 || isNaN(indexProd) || !listaUltima[indexProd]) {
                    await enviarMensaje(numeroCliente, "⚠️ No encontré ese producto. Por favor, volvé a ver la categoría y usá el número correcto (Ej: `agregar 1 2`).");
                    return res.sendStatus(200);
                }

                const prodSeleccionado = listaUltima[indexProd];

                if (prodSeleccionado.stock_fisico < cantidad) {
                    await enviarMensaje(numeroCliente, `⚠️ Stock insuficiente. Solo nos quedan ${prodSeleccionado.stock_fisico} unidades de *${prodSeleccionado.nombre}*.`);
                    return res.sendStatus(200);
                }

                if (!carritosActivos.has(numeroCliente)) {
                    carritosActivos.set(numeroCliente, []);
                }
                const carrito = carritosActivos.get(numeroCliente);
                
                // Vemos si ya estaba en el carrito para sumar cantidad
                const existente = carrito.find(p => p.id_producto === prodSeleccionado.id_producto);
                if (existente) {
                    existente.cantidad += cantidad;
                } else {
                    carrito.push({
                        id_producto: prodSeleccionado.id_producto,
                        nombre: prodSeleccionado.nombre,
                        precio: prodSeleccionado.precio,
                        cantidad: cantidad
                    });
                }

                await enviarMensaje(numeroCliente, `✅ Agregado al carrito: *${cantidad}x ${prodSeleccionado.nombre}*.\n\nEscribí *carrito* para ver tu pedido o seguí comprando.`);
                return res.sendStatus(200);
            }

            // 4. Comando: FINALIZAR COMPRA
            if (textoLower === 'finalizar' || textoLower === 'comprar') {
                const carrito = carritosActivos.get(numeroCliente) || [];
                if (carrito.length === 0) {
                    await enviarMensaje(numeroCliente, "🛒 Tu carrito está vacío. Agregá productos antes de finalizar.");
                    return res.sendStatus(200);
                }

                try {
                    let subtotal = 0;
                    for (let item of carrito) {
                        subtotal += (item.precio * item.cantidad);
                    }

                    await pool.query(`INSERT INTO clientes (whatsapp_id, nombre) VALUES ($1, $2) ON CONFLICT (whatsapp_id) DO NOTHING`, [numeroCliente, 'Cliente WhatsApp']);
                    
                    const resPedido = await pool.query(
                        `INSERT INTO pedidos (whatsapp_id, estado, total_compra) VALUES ($1, $2, $3) RETURNING id_pedido`,
                        [numeroCliente, 'Pendiente', subtotal]
                    );
                    const idNuevoPedido = resPedido.rows[0].id_pedido;

                    for (let item of carrito) {
                        await pool.query(
                            `INSERT INTO detalle_pedidos (id_pedido, id_producto, cantidad, precio_congelado) VALUES ($1, $2, $3, $4)`,
                            [idNuevoPedido, item.id_producto, item.cantidad, item.precio]
                        );
                    }

                    // Vaciamos el carrito activo
                    carritosActivos.delete(numeroCliente);

                    pedidosEsperandoDireccion.set(numeroCliente, { idPedido: idNuevoPedido, subtotal: subtotal, total: subtotal });
                    
                    await enviarMensaje(numeroCliente, "🛒 ¡Recibimos tu pedido!\n\nPara el envío, por favor:\n1️⃣ *Escribinos tu dirección* (Ej: Belgrano 1024)\n2️⃣ O tocá el 📎 (clip) abajo y envianos tu *Ubicación actual* de WhatsApp.");

                } catch (errorFinalizar) {
                    console.error("Error al finalizar pedido:", errorFinalizar);
                    await enviarMensaje(numeroCliente, "Hubo un error al procesar tu pedido. Por favor, intententalo de nuevo.");
                }
                return res.sendStatus(200);
            }

            // 5. Si elige una categoría por número o nombre (o escribe Hola / Menu)
            try {
                const resCats = await pool.query("SELECT DISTINCT categoria FROM productos WHERE stock_fisico > 0 AND categoria IS NOT NULL ORDER BY categoria ASC");
                const categorias = resCats.rows.map(r => r.categoria);

                // Comprobamos si el usuario escribió el nombre de una categoría o un número de categoría
                let catElegida = null;
                const numCat = parseInt(textoRecibido);

                if (!isNaN(numCat) && numCat >= 1 && numCat <= categorias.length) {
                    catElegida = categorias[numCat - 1];
                } else {
                    catElegida = categorias.find(c => c.toLowerCase() === textoLower);
                }

                if (catElegida) {
                    // Mostramos los productos de esa categoría
                    const resProds = await pool.query("SELECT id_producto, nombre, precio, stock_fisico FROM productos WHERE categoria ILIKE $1 AND stock_fisico > 0 ORDER BY nombre ASC", [catElegida]);
                    const productos = resProds.rows;

                    if (productos.length === 0) {
                        await enviarMensaje(numeroCliente, `No hay stock disponible en la categoría *${catElegida}*.`);
                        return res.sendStatus(200);
                    }

                    productosMostrados.set(numeroCliente, productos);

                    let msgProds = `📦 *Góndola: ${catElegida}*\n\n`;
                    productos.forEach((p, idx) => {
                        msgProds += `${idx + 1}. *${p.nombre}* - $${p.precio} _(Stock: ${p.stock_fisico})_\n`;
                    });

                    msgProds += `\n💡 *Para comprar escribí:* \`agregar [número] [cantidad]\`\n*(Ej: \`agregar 1 2\` para llevar 2 unidades del producto 1)*\n\nVer tu carrito escribiendo: *carrito*\nVer categorías escribiendo: *menu*`;
                    
                    await enviarMensaje(numeroCliente, msgProds);
                    return res.sendStatus(200);
                }

                // Si mandó "hola", "menu", "categorias" o cualquier otra cosa: Mostramos el menú principal de categorías
                let msgMenu = "🛒 *¡Bienvenido a Supercompra!*\n\nElegí una góndola escribiendo su número o nombre:\n\n";
                categorias.forEach((cat, idx) => {
                    msgMenu += `${idx + 1}️⃣ ${cat}\n`;
                });
                msgMenu += `\n*Comandos útiles:*\n• Escribí un número o categoría para ver productos\n• *carrito* (para ver tu pedido)\n• *finalizar* (para terminar la compra)`;

                await enviarMensaje(numeroCliente, msgMenu);

            } catch (errorMenuTexto) {
                console.error("Error en menú de texto:", errorMenuTexto);
                await enviarMensaje(numeroCliente, "¡Hola! Bienvenido a Supercompra. Escribí *menu* para ver las categorías.");
            }
        }

        // --- 4. CAPTURA DE BOTONES INTERACTIVOS (TURNOS Y PAGOS) ---
        if (message.type === 'interactive') {
            let opcion = message.interactive.type === 'button_reply' ? message.interactive.button_reply.id : message.interactive.list_reply.id;

            if (opcion === 'entrega_manana' || opcion === 'entrega_tarde' || opcion === 'envio_full') {
                const idPedidoAsociado = pedidosEsperandoTurno.get(numeroCliente);
                if (!idPedidoAsociado) return await enviarMensaje(numeroCliente, "La sesión expiró, por favor reenviá tu carrito.");

                const resTotalPrevio = await pool.query('SELECT total_compra FROM pedidos WHERE id_pedido = $1', [idPedidoAsociado]);
                const subtotalActual = resTotalPrevio.rows[0].total_compra;

                let nuevoEstado = '';
                let recargoExtra = 0;

                if (opcion === 'entrega_manana') {
                    nuevoEstado = 'Pendiente - Mañana';
                } else if (opcion === 'entrega_tarde') {
                    nuevoEstado = 'Pendiente - Tarde';
                } else if (opcion === 'envio_full') {
                    nuevoEstado = 'Pendiente - Full';
                    if (subtotalActual < MINIMO_ENVIO_GRATIS) {
                        recargoExtra = COSTO_FULL; 
                    }
                }

                if (recargoExtra > 0) {
                    await pool.query('UPDATE pedidos SET estado = $1, total_compra = total_compra + $2 WHERE id_pedido = $3', [nuevoEstado, recargoExtra, idPedidoAsociado]);
                } else {
                    await pool.query('UPDATE pedidos SET estado = $1 WHERE id_pedido = $2', [nuevoEstado, idPedidoAsociado]);
                }

                const resTotalFinal = await pool.query('SELECT total_compra FROM pedidos WHERE id_pedido = $1', [idPedidoAsociado]);
                const totalActualizado = resTotalFinal.rows[0].total_compra;

                pedidosEsperandoTurno.delete(numeroCliente);
                pedidosEsperandoPago.set(numeroCliente, idPedidoAsociado);

                const dataMenuPago = {
                    messaging_product: "whatsapp",
                    to: numeroCliente,
                    type: "interactive",
                    interactive: {
                        type: "list",
                        header: { type: "text", text: "💳 Métodos de Pago" },
                        body: { text: `Turno agendado. El total de tu pedido es *$${totalActualizado}*.\n\nElegí cómo preferís abonarlo:` },
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

            if (opcion === 'pago_mp' || opcion === 'pago_transferencia' || opcion === 'pago_cuenta_dni' || opcion === 'pago_efectivo' || opcion === 'pago_tarjeta_pampa') {
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
                    pedidosEsperandoComprobante.set(numeroCliente, { idPedido: idPedidoAsociado, totalEsperado: totalCompra });
                    
                    await enviarMensaje(numeroCliente, `🏦 Elegiste abonar con ${nombreMetodo}.\n\nTotal a transferir: *$${totalCompra}*.\nAlias: *super.compra.ok*\n\nPor favor, *envianos la foto del comprobante* por este chat.`);

                } else if (opcion === 'pago_tarjeta_pampa') {
                    await pool.query(`INSERT INTO pagos (id_pedido, metodo, estado, monto) VALUES ($1, $2, $3, $4)`, [idPedidoAsociado, 'Tarjeta Bco Pampa', 'A Cobrar (Posnet)', totalCompra]);
                    await pool.query('UPDATE pedidos SET estado = $1 WHERE id_pedido = $2', ['En Preparación', idPedidoAsociado]);
                    pedidosEsperandoPago.delete(numeroCliente);
                    await enviarMensaje(numeroCliente, `💳 Pago con *Tarjeta del Banco Pampa* registrado ($${totalCompra}). ¡Llevamos el posnet al entregar!`);
                    await dispararEnvioFactura(idPedidoAsociado, numeroCliente);

                } else if (opcion === 'pago_efectivo') {
                    await pool.query(`INSERT INTO pagos (id_pedido, metodo, estado, monto) VALUES ($1, $2, $3, $4)`, [idPedidoAsociado, 'Efectivo', 'A Cobrar (Efectivo)', totalCompra]);
                    await pool.query('UPDATE pedidos SET estado = $1 WHERE id_pedido = $2', ['En Preparación', idPedidoAsociado]);
                    pedidosEsperandoPago.delete(numeroCliente);
                    await enviarMensaje(numeroCliente, `💵 Pedido registrado para pagar en efectivo al recibir ($${totalCompra}). ¡Ya lo estamos armando!`);
                    await dispararEnvioFactura(idPedidoAsociado, numeroCliente);

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
                        await enviarMensaje(numeroCliente, `💳 Link de pago generado por *$${totalCompra}*:\n${responsePreference.init_point}`);
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