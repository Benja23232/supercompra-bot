const express = require('express');
const cors = require('cors');
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

// 4. NUEVA PUERTA: Webhook de Mercado Pago
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

// Ruta de prueba inicial
app.get('/', (req, res) => {
    res.send('¡Servidor de Supercompra funcionando al 100%!');
});

// Arrancamos el servidor
app.listen(PORT, () => {
    console.log(`🚀 Servidor central corriendo a la perfección en http://localhost:${PORT}`);
});