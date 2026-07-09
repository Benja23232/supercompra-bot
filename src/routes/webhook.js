const express = require('express');
const router = express.Router();
const botController = require('../controllers/botController');

// Middleware para ver TODO lo que entra a /webhook
router.use((req, res, next) => {
    console.log(`--- 📥 PETICIÓN RECIBIDA: ${req.method} ${req.url} ---`);
    next(); // Esto deja que la petición siga su camino
});

// Meta usa una petición GET para validar el token
router.get('/', botController.verificarToken);

// Meta usa peticiones POST para enviar los mensajes de los clientes
router.post('/', botController.recibirMensaje);

module.exports = router;