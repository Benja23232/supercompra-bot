const { makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const pino = require('pino');
const qrcode = require('qrcode-terminal'); // 👈 Importamos el generador visual de QR

async function iniciarSesionWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');

    const sock = makeWASocket({
        auth: state,
        logger: pino({ level: 'silent' })
        // Quitamos printQRInTerminal porque ahora lo manejamos nosotros con qrcode-terminal
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        // 👇 Si Baileys emite un código QR, lo dibujamos en la terminal de forma impecable
        if (qr) {
            console.log('📱 Escaneá el siguiente código QR con el segundo celular de WhatsApp:');
            qrcode.generate(qr, { small: true });
        }

        if (connection === 'close') {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log('Conexión con el 2° número cerrada. Reconectando...', shouldReconnect);
            if (shouldReconnect) {
                iniciarSesionWhatsApp();
            }
        } else if (connection === 'open') {
            console.log('¡Conexión exitosa con el segundo número de WhatsApp!');
        }
    });

    return sock;
}

module.exports = { iniciarSesionWhatsApp };