const express = require('express');
const crypto = require('crypto'); // 👈 NUEVO: para validar la firma HMAC de Meta
const router = express.Router();
const botController = require('../controllers/botController');

// Middleware para ver TODO lo que entra a /webhook
router.use((req, res, next) => {
    console.log(`--- 📥 PETICIÓN RECIBIDA: ${req.method} ${req.url} ---`);
    next(); // Esto deja que la petición siga su camino
});

// 🔐 Middleware de verificación de firma de Meta (X-Hub-Signature-256)
// Solo aplica a POST (los GET de verificación no llevan firma).
// Requiere que en index.js express.json() tenga el `verify` que guarda req.rawBody.
function verificarFirmaMeta(req, res, next) {
    // Los GET (verificación del token) no llevan firma. Pasamos directo.
    if (req.method !== 'POST') return next();

    const signature = req.headers['x-hub-signature-256'];
    const appSecret = process.env.META_APP_SECRET;

    // Si no hay App Secret configurado, avisamos y bloqueamos por seguridad.
    // En desarrollo podés saltearlo con una variable de entorno explícita.
    if (!appSecret) {
        console.error('❌ META_APP_SECRET no está configurado en .env');
        return res.sendStatus(403);
    }

    if (!signature) {
        console.warn('⚠️ Webhook sin cabecera X-Hub-Signature-256. Rechazado.');
        return res.sendStatus(403);
    }

    if (!req.rawBody) {
        console.error('❌ req.rawBody no disponible. ¿Falta el verify en express.json()?');
        return res.sendStatus(500);
    }

    const expectedSignature = 'sha256=' + crypto
        .createHmac('sha256', appSecret)
        .update(req.rawBody)
        .digest('hex');

    // Comparación en tiempo constante para evitar timing attacks
    try {
        const signatureBuffer = Buffer.from(signature, 'utf8');
        const expectedBuffer = Buffer.from(expectedSignature, 'utf8');

        if (
            signatureBuffer.length !== expectedBuffer.length ||
            !crypto.timingSafeEqual(signatureBuffer, expectedBuffer)
        ) {
            console.warn('🚫 Firma de webhook inválida. Posible intento de inyección.');
            return res.sendStatus(403);
        }
    } catch (err) {
        console.error('❌ Error comparando firmas:', err.message);
        return res.sendStatus(403);
    }

    // Firma válida → continúa al controlador
    next();
}

// Meta usa una petición GET para validar el token
router.get('/', botController.verificarToken);

// Meta usa peticiones POST para enviar los mensajes de los clientes
// Aplicamos la verificación de firma SOLO a esta ruta
router.post('/', verificarFirmaMeta, botController.recibirMensaje);

module.exports = router;