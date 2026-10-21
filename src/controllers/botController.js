require('dotenv').config();
const axios = require('axios');
const { enviarMensaje } = require('../services/whatsapp');
const { pool } = require('../services/db'); 
const Tesseract = require('tesseract.js'); 

// Mapas temporales en memoria para retener el carrito hasta que el cliente finalice el flujo
const carritosPendientes = new Map(); 
const pedidosEsperandoDireccion = new Map(); 
const pedidosEsperandoTurno = new Map();
const pedidosEsperandoPago = new Map();
const pedidosEsperandoComprobante = new Map(); 

// Memoria anti-duplicados
const mensajesProcesados = new Set(); 

const COSTO_FULL = 1500;
const MINIMO_ENVIO_GRATIS = 40000;

// --- LÓGICA INTELIGENTE DE HORARIOS ---
function obtenerDatosReparto() {
    const ahora = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Argentina/Buenos_Aires" }));
    const horaDecimal = ahora.getHours() + (ahora.getMinutes() / 60);

    if (horaDecimal >= 19 || horaDecimal < 9.5) {
        return { turno: 'Mañana', horarioTexto: '09:30 a 11:00 hs', estadoBD: 'Pendiente - Mañana' };
    } else {
        return { turno: 'Tarde', horarioTexto: '19:00 a 20:30 hs', estadoBD: 'Pendiente - Tarde' };
    }
}

function obtenerDisponibilidadFullORetiro() {
    const ahora = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Argentina/Buenos_Aires" }));
    const horaDecimal = ahora.getHours() + (ahora.getMinutes() / 60);
    return (horaDecimal >= 7 && horaDecimal < 23);
}

// --- FUNCIONES AUXILIARES DE NAVEGACIÓN ---
async function enviarMenuRubros(numeroCliente) {
    try {
        console.log(`🔍 [1/3] Buscando rubros en la BD para ${numeroCliente}...`);
        const resRubros = await pool.query("SELECT DISTINCT rubro FROM productos WHERE stock_fisico > 0 AND rubro IS NOT NULL AND TRIM(rubro) <> '' ORDER BY rubro ASC");
        
        console.log(`✅ [2/3] BD respondió. Rubros encontrados: ${resRubros.rows.length}`);

        if (resRubros.rows.length > 0) {
            const rowsRubros = resRubros.rows.map(row => ({
                id: `rubro_${row.rubro.trim().substring(0, 20)}`, 
                title: row.rubro.trim().substring(0, 24) 
            }));

            const dataMenuRubros = {
                messaging_product: "whatsapp",
                to: numeroCliente,
                type: "interactive",
                interactive: {
                    type: "list",
                    header: { type: "text", text: "Supercompra" },
                    body: { text: "¡Hola! 👋 Bienvenido a nuestro súper.\n\nDesplegá el menú de abajo para ver nuestros rubros." },
                    footer: { text: "Navegá por nuestro catálogo" },
                    action: {
                        button: "Ver Rubros",
                        sections: [{
                            title: "Rubros Principales",
                            rows: rowsRubros.slice(0, 10)
                        }]
                    }
                }
            };
            
            console.log("📤 [3/3] Enviando petición a Meta para mostrar el menú...");
            await axios.post(`https://graph.facebook.com/v17.0/${process.env.WHATSAPP_PHONE_ID}/messages`, dataMenuRubros, { headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}` } });
            console.log("🚀 ¡Menú enviado exitosamente!");
        } else {
             await enviarMensaje(numeroCliente, "¡Hola! 👋 Bienvenido a Supercompra.\n\nEn este momento estamos reponiendo stock. ¡Volvé a consultarnos más tarde!");
        }
    } catch (error) {
        console.error("❌ Error CRÍTICO en enviarMenuRubros:", error.response?.data || error.message);
        await enviarMensaje(numeroCliente, "¡Hola! 👋 Bienvenido a Supercompra.\n\nEn este momento estamos reponiendo stock. ¡Volvé a consultarnos más tarde!");
    }
}

async function enviarMenuCategorias(numeroCliente, rubro) {
    try {
        const resCategorias = await pool.query("SELECT DISTINCT categoria FROM productos WHERE rubro ILIKE $1 AND stock_fisico > 0 AND categoria IS NOT NULL AND TRIM(categoria) <> '' ORDER BY categoria ASC", [`${rubro}%`]);
        
        if (resCategorias.rows.length > 0) {
            const rowsCategorias = resCategorias.rows.map(row => ({
                id: `cat_${row.categoria.trim().substring(0, 20)}`, 
                title: row.categoria.trim().substring(0, 24) 
            }));

            const dataMenuCategorias = {
                messaging_product: "whatsapp",
                to: numeroCliente,
                type: "interactive",
                interactive: {
                    type: "list",
                    body: { text: `Estás en la sección *${rubro}*.\n\nElegí una góndola para ver los productos:` },
                    action: {
                        button: "Ver Góndolas",
                        sections: [{
                            title: "Góndolas Disponibles",
                            rows: rowsCategorias.slice(0, 10)
                        }]
                    }
                }
            }
            await axios.post(`https://graph.facebook.com/v17.0/${process.env.WHATSAPP_PHONE_ID}/messages`, dataMenuCategorias, { headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}` } });
        } else {
            await enviarMensaje(numeroCliente, "No hay stock en este rubro por el momento.");
        }
    } catch (error) {
        console.error("Error armando menú de categorías:", error.response?.data || error.message);
    }
}

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

// --- MANEJO DEL WEBHOOK ---
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
        console.log("🔥 Entró a recibirMensaje"); 

        const message = req.body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
        
        if (!message) {
            console.log("🛑 Abortado: No hay mensaje en el body.");
            return res.sendStatus(200);
        }

        console.log(`💬 Mensaje recibido de ${message.from}: Tipo [${message.type}]`); 

        if (mensajesProcesados.has(message.id)) {
            console.log("♻️ Abortado: Mensaje duplicado.");
            return res.sendStatus(200);
        }
        mensajesProcesados.add(message.id);
        if (mensajesProcesados.size > 500) mensajesProcesados.clear();

        // FIX: Tomamos el número exacto que manda Meta, sin borrarle el "9" de Argentina
        let numeroCliente = message.from;

        // 🛑 BLOQUEO ESTRICTO: Si está esperando dirección y manda algo no válido
        if (pedidosEsperandoDireccion.has(numeroCliente) && message.type !== 'text' && message.type !== 'location' && message.type !== 'interactive' && message.type !== 'order') {
            await enviarMensaje(numeroCliente, "🛑 *Falta tu dirección.*\n\nNo podemos procesar audios ni stickers en este paso. Por favor, escribí tu calle y número con texto, o envianos tu ubicación GPS (📍) para poder avanzar con la compra.");
            return res.sendStatus(200);
        }

        // --- 1. MANEJO DE UBICACIÓN (GPS) ---
        if (message.type === 'location') {
            if (pedidosEsperandoDireccion.has(numeroCliente)) {
                const lat = message.location.latitude;
                const lng = message.location.longitude;
                const direccionGPS = `https://maps.google.com/?q=${lat},${lng}`;

                const datosTemp = pedidosEsperandoDireccion.get(numeroCliente);
                datosTemp.direccion = direccionGPS;

                pedidosEsperandoDireccion.delete(numeroCliente);
                pedidosEsperandoTurno.set(numeroCliente, datosTemp);

                const datosReparto = obtenerDatosReparto();
                const textoBotonFull = datosTemp.subtotal >= MINIMO_ENVIO_GRATIS ? "🚀 Full (GRATIS)" : `🚀 Full (+$${COSTO_FULL})`;
                const estadoFullLocal = obtenerDisponibilidadFullORetiro() ? "Disponible hasta las 23hs" : "Cerrado (Abre 07hs)";

                const dataBotonesTurno = {
                    messaging_product: "whatsapp",
                    to: numeroCliente,
                    type: "interactive",
                    interactive: {
                        type: "button",
                        body: { text: `📍 ¡Ubicación GPS guardada!\n\n🚚 *Reparto (Gratis):* Se entregará de ${datosReparto.horarioTexto}.\n🚀 *Full:* ${estadoFullLocal}.\n\n¿Qué tipo de envío preferís?` },
                        action: {
                            buttons: [
                                { type: "reply", reply: { id: "reparto_normal", title: "🚚 Reparto Normal" } },
                                { type: "reply", reply: { id: "envio_full", title: textoBotonFull } }
                            ]
                        }
                    }
                };
                await axios.post(`https://graph.facebook.com/v17.0/${process.env.WHATSAPP_PHONE_ID}/messages`, dataBotonesTurno, { headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}` } });
                return res.sendStatus(200);
            }
        }

        // --- 2. MANEJO DE MENSAJES DE TEXTO ---
        if (message.type === 'text') {
            const textoRecibido = message.text.body;

            if (pedidosEsperandoDireccion.has(numeroCliente)) {
                let direccionMejorada = textoRecibido.trim();
                
                if (direccionMejorada.length < 5) {
                    await enviarMensaje(numeroCliente, "🛑 *Falta tu dirección.*\n\nLa dirección que ingresaste es demasiado corta. Es obligatorio que nos pases tu calle y número (Ej: Belgrano 1024) o envíes tu ubicación por GPS (📍) para poder entregar tu pedido.");
                    return res.sendStatus(200);
                }

                if (!direccionMejorada.toLowerCase().includes('tres lomas')) {
                    direccionMejorada = `${direccionMejorada}, Tres Lomas`;
                }

                const datosTemp = pedidosEsperandoDireccion.get(numeroCliente);
                datosTemp.direccion = direccionMejorada;

                pedidosEsperandoDireccion.delete(numeroCliente);
                pedidosEsperandoTurno.set(numeroCliente, datosTemp);

                const datosReparto = obtenerDatosReparto();
                const textoBotonFull = datosTemp.subtotal >= MINIMO_ENVIO_GRATIS ? "🚀 Full (GRATIS)" : `🚀 Full (+$${COSTO_FULL})`;
                const estadoFullLocal = obtenerDisponibilidadFullORetiro() ? "Disponible hasta las 23hs" : "Cerrado (Abre 07hs)";

                const dataBotonesTurno = {
                    messaging_product: "whatsapp",
                    to: numeroCliente,
                    type: "interactive",
                    interactive: {
                        type: "button",
                        body: { text: `📍 ¡Dirección guardada! (${direccionMejorada})\n\n🚚 *Reparto (Gratis):* Se entregará de ${datosReparto.horarioTexto}.\n🚀 *Full:* ${estadoFullLocal}.\n\n¿Qué tipo de envío preferís?` },
                        action: {
                            buttons: [
                                { type: "reply", reply: { id: "reparto_normal", title: "🚚 Reparto Normal" } },
                                { type: "reply", reply: { id: "envio_full", title: textoBotonFull } }
                            ]
                        }
                    }
                };
                await axios.post(`https://graph.facebook.com/v17.0/${process.env.WHATSAPP_PHONE_ID}/messages`, dataBotonesTurno, { headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}` } });
                return res.sendStatus(200); 
            }

            if (textoRecibido.toLowerCase().includes('quiero pedir la promo:')) {
                const nombrePromoBuscada = textoRecibido.split(':')[1]?.replace(/\*/g, '').trim() || '';
                try {
                    const resPromo = await pool.query("SELECT * FROM productos WHERE nombre ILIKE $1 AND tipo = 'combo'", [`%${nombrePromoBuscada}%`]);
                    if (resPromo.rows.length > 0) {
                        const promo = resPromo.rows[0];
                        await enviarMensaje(numeroCliente, `✨ ¡Encontré la promo que buscás!\n\n*${promo.nombre}*\n💰 Precio: *$${promo.precio}*\n\nPara pedirla y sumarla a tu carrito, podés explorar nuestro catálogo interactivo.`);
                    } else {
                        await enviarMensaje(numeroCliente, `¡Hola! Vi que querés consultar por una promo. Acá te comparto nuestros rubros disponibles para que elijas lo que más te guste:`);
                    }
                } catch (errorPromo) {
                    console.error("Error buscando promo por texto:", errorPromo);
                }
                await enviarMenuRubros(numeroCliente);
                return res.sendStatus(200);
            }

            // Fallback: Muestra el menú para cualquier texto ("Hola", "Buen dia", etc)
            await enviarMenuRubros(numeroCliente);
            return res.sendStatus(200);
        }

        // --- 3. MANEJO DE IMÁGENES (OCR INTELIGENTE) ---
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
                    
                    const montoNum = Number(datosPago.totalEsperado);
                    const montoEnteroStr = Math.floor(montoNum).toString(); 
                    
                    const montoConPuntoMiles = montoEnteroStr.replace(/\B(?=(\d{3})+(?!\d))/g, "."); 
                    const montoConComaMiles = montoEnteroStr.replace(/\B(?=(\d{3})+(?!\d))/g, ","); 
                    
                    const textoLimpiado = text.replace(/[\$\s]/g, '');

                    const pagoValidado = 
                        text.includes(String(datosPago.totalEsperado)) || 
                        textoLimpiado.includes(montoEnteroStr) ||       
                        textoLimpiado.includes(montoConPuntoMiles) ||    
                        textoLimpiado.includes(montoConComaMiles);      
                    
                    if (pagoValidado) {
                        await pool.query('UPDATE pagos SET estado = $1 WHERE id_pedido = $2', ['Aprobado', datosPago.idPedido]);
                        await pool.query('UPDATE pedidos SET estado = $1 WHERE id_pedido = $2', ['En Preparación', datosPago.idPedido]);
                        pedidosEsperandoComprobante.delete(numeroCliente);
                        
                        await enviarMensaje(numeroCliente, `✅ ¡Pago validado con éxito!\n\nImporte de *$${montoConPuntoMiles}* confirmado. ¡Pedido en preparación!`);
                        await dispararEnvioFactura(datosPago.idPedido, numeroCliente);
                    } else {
                        await enviarMensaje(numeroCliente, `⚠️ No pude validar automáticamente el monto exacto de *$${montoConPuntoMiles}* en la foto. Un asesor lo revisará a la brevedad.`);
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

        // --- 4. RECEPCIÓN DEL CARRITO NATIVO ---
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
                
                const totalCarrito = subtotal;

                // Guardamos los datos de forma temporal en memoria RAM hasta que el usuario termine todo el flujo
                const datosTemporales = {
                    subtotal: subtotal,
                    total: totalCarrito,
                    detalles: detallesParaInsertar
                };

                carritosPendientes.set(numeroCliente, datosTemporales);
                pedidosEsperandoDireccion.set(numeroCliente, datosTemporales);
                
                const dataOpcionesEntrega = {
                    messaging_product: "whatsapp",
                    to: numeroCliente,
                    type: "interactive",
                    interactive: {
                        type: "button",
                        body: { text: "🛒 ¡Recibimos tu pedido y verificamos stock!\n\n¿Cómo preferís recibirlo?\n\n🚚 *Envío a Domicilio*\n🏪 *Retiro en Depósito (Mitre 1044)*" },
                        action: {
                            buttons: [
                                { type: "reply", reply: { id: "entrega_domicilio", title: "🚚 A Domicilio" } },
                                { type: "reply", reply: { id: "retiro_deposito", title: "🏪 Retiro Depósito" } }
                            ]
                        }
                    }
                };
                await axios.post(`https://graph.facebook.com/v17.0/${process.env.WHATSAPP_PHONE_ID}/messages`, dataOpcionesEntrega, { headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}` } });

            } catch (errorBD) {
                console.error("Error BD Carrito:", errorBD);
            }
            return res.sendStatus(200);
        }

        // --- 5. CAPTURA DE BOTONES Y LISTAS INTERACTIVAS ---
        if (message.type === 'interactive') {
            let opcion = message.interactive.type === 'button_reply' ? message.interactive.button_reply.id : message.interactive.list_reply.id;

            if (opcion === 'ver_menu_rubros') {
                await enviarMenuRubros(numeroCliente);
                return res.sendStatus(200);
            }

            if (opcion.startsWith('rubro_')) {
                const rubroElegido = opcion.replace('rubro_', '');
                await enviarMenuCategorias(numeroCliente, rubroElegido);
                return res.sendStatus(200);
            }

            if (opcion.startsWith('cat_')) {
                const categoriaElegida = opcion.replace('cat_', '');

                if (categoriaElegida.toLowerCase().includes('alcohol') || categoriaElegida.toLowerCase().includes('bebidas con alcohol')) {
                    const dataImagenBebidas = {
                        messaging_product: "whatsapp",
                        to: numeroCliente,
                        type: "image",
                        image: {
                            link: "https://ntungxnymcijfxueucoz.supabase.co/storage/v1/object/public/catalogo/catalogo.jpeg",
                            caption: "🍷 *Catálogo de Bebidas con Alcohol*\n\n" +
                                     "¡Hola! Mirá nuestro catálogo visual en la imagen de arriba.\n\n" +
                                     "👉 *Para pedir bebidas, escribile directo a nuestro asesor haciendo clic acá:*\n" +
                                     "https://api.whatsapp.com/send?phone=5492392689864&text=¡Hola!%20Quiero%20pedir%20una%20bebida%20por%20acá"
                        }
                    };
                    try {
                        await axios.post(`https://graph.facebook.com/v17.0/${process.env.WHATSAPP_PHONE_ID}/messages`, dataImagenBebidas, { headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}` } });
                    } catch (errorFlyer) {
                        await enviarMensaje(numeroCliente, "🍷 *Catálogo de Bebidas*\n\nPara hacer tu pedido, escribile directo a nuestro asesor acá:\nhttps://api.whatsapp.com/send?phone=5492392689864&text=¡Hola!%20Quiero%20pedir%20una%20bebida%20por%20acá");
                    }
                    return res.sendStatus(200);
                }

                try {
                    const resProductos = await pool.query("SELECT id_producto, categoria FROM productos WHERE categoria ILIKE $1 AND stock_fisico > 0 LIMIT 30", [`${categoriaElegida}%`]);
                    if (resProductos.rows.length > 0) {
                        const nombreCategoriaReal = resProductos.rows[0].categoria;
                        const productItems = resProductos.rows.map(p => ({ product_retailer_id: p.id_producto }));
                        const dataListaProductos = {
                            messaging_product: "whatsapp",
                            recipient_type: "individual",
                            to: numeroCliente,
                            type: "interactive",
                            interactive: {
                                type: "product_list",
                                header: { type: "text", text: `Góndola: ${nombreCategoriaReal.substring(0, 45)}` },
                                body: { text: `Explorá los productos y sumalos a tu carrito.` },
                                action: {
                                    catalog_id: "2194379468072114",
                                    sections: [{
                                        title: nombreCategoriaReal.substring(0, 24),
                                        product_items: productItems
                                    }]
                                }
                            }
                        };
                        await axios.post(`https://graph.facebook.com/v17.0/${process.env.WHATSAPP_PHONE_ID}/messages`, dataListaProductos, { headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}` } });

                        const dataBotonVolver = {
                            messaging_product: "whatsapp",
                            to: numeroCliente,
                            type: "interactive",
                            interactive: {
                                type: "button",
                                body: { text: "¿Querés buscar en otros rubros?" },
                                action: {
                                    buttons: [
                                        { type: "reply", reply: { id: "ver_menu_rubros", title: "📂 Volver a Rubros" } }
                                    ]
                                }
                            }
                        };
                        await axios.post(`https://graph.facebook.com/v17.0/${process.env.WHATSAPP_PHONE_ID}/messages`, dataBotonVolver, { headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}` } });
                    } else {
                        await enviarMensaje(numeroCliente, "No hay stock disponible en esta góndola por el momento.");
                    }
                } catch (errorCatalogo) {
                    console.error("Error enviando productos de categoría:", errorCatalogo.response?.data || errorCatalogo.message);
                }
                return res.sendStatus(200); 
            }

            if (opcion === 'entrega_domicilio') {
                if (!pedidosEsperandoDireccion.has(numeroCliente)) return await enviarMensaje(numeroCliente, "La sesión expiró, por favor reenviá tu carrito.");
                await enviarMensaje(numeroCliente, "¡Perfecto! 🚚\n\nPara el envío, podés hacer dos cosas:\n1️⃣ *Escribirnos tu dirección* (Ej: Belgrano 1024)\n2️⃣ Tocar el 📎 (clip) abajo y enviarnos tu *Ubicación actual* de WhatsApp para mayor precisión.");
                return res.sendStatus(200);
            }

            if (opcion === 'retiro_deposito') {
                const datosTemp = pedidosEsperandoDireccion.get(numeroCliente);
                if (!datosTemp) return await enviarMensaje(numeroCliente, "La sesión expiró, por favor reenviá tu carrito.");

                datosTemp.direccion = 'Retiro en depósito (Mitre 1044)';
                datosTemp.estadoBD = 'Pendiente - Retiro';
                
                pedidosEsperandoDireccion.delete(numeroCliente);
                pedidosEsperandoPago.set(numeroCliente, datosTemp);

                const textoHorarioRetiro = obtenerDisponibilidadFullORetiro()
                    ? "Podés pasar a buscarlo ahora o hasta las 23:00 hs."
                    : "Te recordamos que abrimos a partir de las 07:00 hs.";

                const dataMenuPago = {
                    messaging_product: "whatsapp",
                    to: numeroCliente,
                    type: "interactive",
                    interactive: {
                        type: "list",
                        header: { type: "text", text: "Métodos de Pago" },
                        body: { text: `¡Buenísimo! Vas a retirar por nuestro depósito en *Mitre 1044*. 🏪\n${textoHorarioRetiro}\n\nEl total de tu pedido es *$${datosTemp.total}*.\n\nElegí cómo preferís abonarlo:` },
                        footer: { text: "Supercompra" },
                        action: {
                            button: "Elegir pago",
                            sections: [
                                {
                                    title: "Opciones disponibles",
                                    rows: [
                                        { id: "pago_transferencia", title: "Transferencia", description: "Por Alias o CBU" },
                                        { id: "pago_efectivo", title: "Efectivo", description: "Pagás al retirar o recibir" }
                                    ]
                                }
                            ]
                        }
                    }
                };
                await axios.post(`https://graph.facebook.com/v17.0/${process.env.WHATSAPP_PHONE_ID}/messages`, dataMenuPago, { headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}` } });
                return res.sendStatus(200);
            }

            if (opcion === 'reparto_normal' || opcion === 'envio_full') {
                const datosTemp = pedidosEsperandoTurno.get(numeroCliente);
                if (!datosTemp) return await enviarMensaje(numeroCliente, "La sesión expiró, por favor reenviá tu carrito.");

                let textoConfirmacionHorario = '';

                if (opcion === 'reparto_normal') {
                    const datosReparto = obtenerDatosReparto();
                    datosTemp.estadoBD = datosReparto.estadoBD;
                    textoConfirmacionHorario = `Turno agendado para el reparto de la ${datosReparto.turno} (entre las ${datosReparto.horarioTexto}).`;
                } else if (opcion === 'envio_full') {
                    datosTemp.estadoBD = 'Pendiente - Full';
                    if (datosTemp.subtotal < MINIMO_ENVIO_GRATIS) {
                        datosTemp.total = datosTemp.subtotal + COSTO_FULL;
                    }
                    
                    textoConfirmacionHorario = obtenerDisponibilidadFullORetiro()
                        ? "🚀 Envío Full agendado. Te lo preparamos y mandamos enseguida."
                        : "🚀 Envío Full agendado. Te lo mandamos a primera hora apenas abramos a las 07:00 hs.";
                }

                pedidosEsperandoTurno.delete(numeroCliente);
                pedidosEsperandoPago.set(numeroCliente, datosTemp);

                const dataMenuPago = {
                    messaging_product: "whatsapp",
                    to: numeroCliente,
                    type: "interactive",
                    interactive: {
                        type: "list",
                        header: { type: "text", text: "Métodos de Pago" },
                        body: { text: `${textoConfirmacionHorario}\n\nEl total de tu pedido es *$${datosTemp.total}*.\n\nElegí cómo preferís abonarlo:` },
                        footer: { text: "Supercompra" },
                        action: {
                            button: "Elegir pago",
                            sections: [
                                {
                                    title: "Opciones disponibles",
                                    rows: [
                                        { id: "pago_transferencia", title: "Transferencia", description: "Por Alias o CBU" },
                                        { id: "pago_efectivo", title: "Efectivo", description: "Pagás al retirar o recibir" }
                                    ]
                                }
                            ]
                        }
                    }
                };
                await axios.post(`https://graph.facebook.com/v17.0/${process.env.WHATSAPP_PHONE_ID}/messages`, dataMenuPago, { headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}` } });
                return res.sendStatus(200);
            }

            // --- 6. PASO FINAL: SELECCIÓN DE PAGO E INSERCIÓN REAL EN BASE DE DATOS ---
            if (opcion === 'pago_transferencia' || opcion === 'pago_efectivo') {
                const datosTemp = pedidosEsperandoPago.get(numeroCliente);
                if (!datosTemp) return await enviarMensaje(numeroCliente, "Hubo un problema con tu sesión de pago. Por favor reenviá tu carrito.");

                // CREACIÓN OFICIAL DEL PEDIDO EN SUPABASE
                const resPedido = await pool.query(
                    `INSERT INTO pedidos (whatsapp_id, estado, total_compra, direccion) VALUES ($1, $2, $3, $4) RETURNING id_pedido`,
                    [numeroCliente, datosTemp.estadoBD, datosTemp.total, datosTemp.direccion]
                );
                const idNuevoPedido = resPedido.rows[0].id_pedido;

                // INSERCIÓN DE LOS PRODUCTOS DEL CARRITO
                for (let detalle of datosTemp.detalles) {
                    await pool.query(
                        `INSERT INTO detalle_pedidos (id_pedido, id_producto, cantidad, precio_congelado) VALUES ($1, $2, $3, $4)`,
                        [idNuevoPedido, detalle.id, detalle.cantidad, detalle.precio]
                    );
                }

                if (opcion === 'pago_transferencia') {
                    await pool.query(
                        `INSERT INTO pagos (id_pedido, metodo, estado, monto) VALUES ($1, $2, $3, $4)`,
                        [idNuevoPedido, 'Transferencia', 'Pendiente de Verificación', datosTemp.total]
                    );
                    
                    pedidosEsperandoPago.delete(numeroCliente);
                    carritosPendientes.delete(numeroCliente);
                    pedidosEsperandoComprobante.set(numeroCliente, { idPedido: idNuevoPedido, totalEsperado: datosTemp.total });
                    
                    await enviarMensaje(numeroCliente, `🏦 Elegiste abonar con Transferencia.\n\nPara confirmar tu pedido, por favor realizá una transferencia por el total de *$${datosTemp.total}*.\n\n👇 *Mantené presionado el CBU o el Alias abajo para copiarlo fácilmente:*`);
                    await enviarMensaje(numeroCliente, "0000003100010768128016");
                    await enviarMensaje(numeroCliente, "supercompras.3lo");
                    await enviarMensaje(numeroCliente, "Una vez que hagas el pago, por favor *envianos la foto del comprobante* por este chat. 🧾✅");

                } else if (opcion === 'pago_efectivo') {
                    await pool.query(
                        `INSERT INTO pagos (id_pedido, metodo, estado, monto) VALUES ($1, $2, $3, $4)`,
                        [idNuevoPedido, 'Efectivo', 'A Cobrar (Efectivo)', datosTemp.total]
                    );
                    
                    pedidosEsperandoPago.delete(numeroCliente);
                    carritosPendientes.delete(numeroCliente);

                    await enviarMensaje(numeroCliente, `💵 Pedido registrado para pagar en efectivo ($${datosTemp.total}). ¡Ya lo estamos armando!`);
                    await dispararEnvioFactura(idNuevoPedido, numeroCliente);
                }
                return res.sendStatus(200);
            }
        }
        
        res.sendStatus(200);
    } catch (e) {
        console.error('Error general webhook:', e);
        res.sendStatus(200);
    }
};

// --- FUNCIÓN DE DIFUSIÓN MASIVA DE PROMOS ---
const difundirPromo = async (req, res) => {
    try {
        const { mensajePromo } = req.body;
        if (!mensajePromo) {
            return res.status(400).json({ success: false, error: "Falta el mensaje de la promo" });
        }

        const resClientes = await pool.query("SELECT DISTINCT whatsapp_id FROM clientes");
        const clientes = resClientes.rows;

        if (clientes.length === 0) {
            return res.status(404).json({ success: false, error: "No hay clientes registrados en la base de datos." });
        }

        let enviados = 0;
        let errores = 0;

        for (let cliente of clientes) {
            let numero = cliente.whatsapp_id;
            try {
                await enviarMensaje(numero, mensajePromo);
                enviados++;
                await new Promise(resolve => setTimeout(resolve, 1000));
            } catch (errEnvio) {
                console.error(`Error enviando difusión a ${numero}:`, errEnvio.response?.data || errEnvio.message);
                errores++;
            }
        }

        return res.json({ 
            success: true, 
            message: `Difusión finalizada. Enviados: ${enviados}, Errores: ${errores}` 
        });

    } catch (error) {
        console.error("Error en difusión masiva:", error);
        return res.status(500).json({ success: false, error: "Error interno en el servidor al realizar la difusión." });
    }
};

// --- FUNCIÓN PARA NOTIFICAR QUE EL PEDIDO ESTÁ LISTO ---
const notificarPedidoListo = async (req, res) => {
    try {
        const { id_pedido } = req.body;
        if (!id_pedido) return res.status(400).json({ success: false, error: "Falta el ID del pedido" });

        const resPedido = await pool.query("SELECT whatsapp_id, direccion FROM pedidos WHERE id_pedido = $1", [id_pedido]);
        if (resPedido.rows.length === 0) return res.status(404).json({ success: false, error: "Pedido no encontrado." });

        const { whatsapp_id, direccion } = resPedido.rows[0];

        if (direccion && direccion.includes('Mitre 1044')) {
            await enviarMensaje(whatsapp_id, "✅ ¡Hola! Tu pedido ya está armado y listo para retirar. 📦\n\nTe esperamos por nuestro depósito en *Mitre 1044*.\n\n¡Gracias por elegir Supercompra!");
        } else {
            await enviarMensaje(whatsapp_id, "✅ ¡Hola! Tu pedido ya está armado y listo. 🚚💨\n\nEn el transcurso del turno que elegiste te lo estaremos llevando a tu domicilio.\n\n¡Gracias por elegir Supercompra!");
        }

        return res.json({ success: true, message: "Cliente notificado con éxito." });
    } catch (error) {
        console.error("Error notificando pedido listo:", error);
        return res.status(500).json({ success: false, error: "Error al notificar al cliente." });
    }
};

module.exports = { verificarToken, recibirMensaje, difundirPromo, notificarPedidoListo };