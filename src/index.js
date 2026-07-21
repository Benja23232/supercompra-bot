const express = require('express');
const cors = require('cors');
const axios = require('axios'); // <-- Para enviar las plantillas a Meta
require('dotenv').config();

// 1. Enchufamos la base de datos y la función de mensajes
const { pool } = require('./services/db');
const { enviarMensaje } = require('./services/whatsapp');

// Importamos Mercado Pago
const { MercadoPagoConfig, Payment } = require('mercadopago');
const client = new MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN });
const paymentClient = new Payment(client);

// 2. Importamos las rutas de WhatsApp (puertas de entrada)
const webhookRoutes = require('./routes/webhook');

// Inicializamos la aplicación
const app = express();
const PORT = process.env.PORT || 3000;

// Middlewares
app.use(cors());
app.use(express.json());

// 3. Activamos la ruta para WhatsApp
app.use('/webhook', webhookRoutes);

// 4. Webhook de Mercado Pago
app.post('/mercadopago-webhook', async (req, res) => {
    // A. Devolver el 200 OK rápido para que Mercado Pago no reintente
    res.sendStatus(200);

    try {
        const { type, data } = req.body;

        if (type === 'payment' && data && data.id) {
            console.log(`🔍 Verificando pago ID: ${data.id} en Mercado Pago...`);

            // B. Buscamos los detalles reales de este pago
            const pagoInfo = await paymentClient.get({ id: data.id });

            if (pagoInfo.status === 'approved') {
                const idPedido = pagoInfo.external_reference;

                // C. Actualizamos la base de datos
                await pool.query(
                    "UPDATE pagos SET estado = 'Aprobado', transaccion_id = $1 WHERE id_pedido = $2",
                    [pagoInfo.id, idPedido]
                );

                // D. Buscamos al cliente para avisarle
                const resPedido = await pool.query(
                    "SELECT whatsapp_id FROM pedidos WHERE id_pedido = $1",
                    [idPedido]
                );

                if (resPedido.rows.length > 0) {
                    const numeroCliente = resPedido.rows[0].whatsapp_id;

                    const mensajeExito = 
                        `🎉 ¡Pago recibido con éxito!\n\n` +
                        `Tu pedido *#${idPedido}* ya está completamente abonado y en preparación. ` +
                        `Te avisaremos cuando esté listo para ser entregado. ¡Muchas gracias por tu compra!`;
                    
                    await enviarMensaje(numeroCliente, mensajeExito);
                    console.log(`✅ Pago aprobado y cliente notificado para el pedido #${idPedido}`);
                }
            }
        }
    } catch (error) {
        console.error("❌ Error procesando webhook de Mercado Pago:", error);
    }
});

// 5. NUEVA PUERTA: Envío de Difusiones / Promociones (Actualizada con Variables y código 'es')
// NUEVA PUERTA: Obtener lista de productos para el panel
app.get('/api/productos', async (req, res) => {
    try {
        // Asumo que tu tabla se llama 'productos', ajustalo si se llama distinto
        const result = await pool.query("SELECT id_producto, nombre, precio FROM productos WHERE estado = 'activo'"); 
        // Nota: Si no tenés una columna 'estado', dejá solo "SELECT id_producto, nombre, precio FROM productos"
        
        res.json(result.rows);
    } catch (error) {
        console.error("❌ Error al obtener productos:", error);
        res.status(500).json({ error: 'Error al obtener la lista de productos' });
    }
});
app.post('/api/difusion', async (req, res) => {
    // Aceptamos también el array de variables desde el panel web
    const { templateName, variables } = req.body;

    if (!templateName) {
        return res.status(400).json({ error: 'Falta el nombre de la plantilla' });
    }

    try {
        // A. Buscamos los números únicos directamente desde la base de datos
        // DISTINCT hace que si un cliente compró 5 veces, su número traiga solo 1 vez.
        const resPedidos = await pool.query(
            "SELECT DISTINCT whatsapp_id FROM pedidos WHERE whatsapp_id IS NOT NULL"
        );

        const numerosUnicos = resPedidos.rows.map(row => row.whatsapp_id);

        if (numerosUnicos.length === 0) {
            return res.status(404).json({ error: 'No hay clientes registrados.' });
        }

        // B. Preparamos las variables para Meta
        let componentesTemplate = [];
        
        // Formateamos las variables si el panel web nos envía alguna
        if (variables && variables.length > 0) {
            const parametrosMeta = variables.map(textoVariable => ({
                type: 'text',
                text: String(textoVariable)
            }));

            componentesTemplate = [
                {
                    type: 'body',
                    parameters: parametrosMeta
                }
            ];
        }

        // C. Preparamos credenciales de Meta
        const token = process.env.WHATSAPP_TOKEN;
        const phoneId = process.env.WHATSAPP_PHONE_ID;

        let enviados = 0;
        let fallidos = 0;

        // D. Bucle: Disparamos la plantilla a cada número
        for (const numero of numerosUnicos) {
            try {
                // Armamos el cuerpo básico del mensaje
                const payloadMeta = {
                    messaging_product: 'whatsapp',
                    to: numero,
                    type: 'template',
                    template: {
                        name: templateName,
                        language: { code: 'es' } // Código oficial para Español genérico
                    }
                };

                // Si hay variables, las inyectamos al mensaje
                if (componentesTemplate.length > 0) {
                    payloadMeta.template.components = componentesTemplate;
                }

                await axios.post(
                    `https://graph.facebook.com/v17.0/${phoneId}/messages`,
                    payloadMeta,
                    {
                        headers: { Authorization: `Bearer ${token}` }
                    }
                );
                enviados++;
            } catch (err) {
                console.error(`Error enviando a ${numero}:`, err.response?.data || err.message);
                fallidos++;
            }
        }

        // E. Devolvemos el reporte a tu panel Vercel
        res.json({ 
            mensaje: 'Difusión finalizada con éxito', 
            total_clientes: numerosUnicos.length,
            enviados: enviados, 
            fallidos: fallidos 
        });

    } catch (error) {
        console.error('❌ Error en difusión masiva:', error);
        res.status(500).json({ error: 'Hubo un error en el servidor.' });
    }
});

// Ruta de prueba inicial
app.get('/', (req, res) => {
    res.send('¡Servidor de Supercompra funcionando al 100%!');
});

// Arrancamos el servidor
app.listen(PORT, () => {
    console.log(`🚀 Servidor central corriendo a la perfección en http://localhost:${PORT}`);
});