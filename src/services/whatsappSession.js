const { makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const pino = require('pino');
const fs = require('fs');
const path = require('path');

async function iniciarSesionWhatsApp() {
    console.log("🚀 Iniciando conexión para el segundo número en la nube...");

    // Creamos la carpeta auth_info_baileys si no existe en el servidor
    const authDir = path.join(__dirname, '../../auth_info_baileys');
    if (!fs.existsSync(authDir)) {
        fs.mkdirSync(authDir, { recursive: true });
    }

    // Opcional: Si configuramos la variable de entorno con el creds.json, lo restauramos automáticamente en Render
    const credsPath = path.join(authDir, 'creds.json');
    if (process.env.WHATSAPP_CREDS && !fs.existsSync(credsPath)) {
        console.log("📥 Restaurando credenciales desde la variable de entorno de Render...");
        fs.writeFileSync(credsPath, process.env.WHATSAPP_CREDS);
    }

    const { state, saveCreds } = await useMultiFileAuthState(authDir);

    const sock = makeWASocket({
        auth: state,
        logger: pino({ level: 'silent' }),
        browser: ["Supercompra Bot", "Chrome", "10.0"]
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        
        if (connection === 'close') {
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
            
            console.log(`❌ Conexión cerrada. Código: ${statusCode}.`);
            if (shouldReconnect) {
                console.log('Reintentando conexión en 10 segundos...');
                setTimeout(() => iniciarSesionWhatsApp(), 10000);
            }
        } else if (connection === 'open') {
            console.log('✅ ¡CONEXIÓN EXITOSA EN LA NUBE! El segundo número está activo.');
        }
    });

    // 👇 ESCUCHA DE MENSAJES ENTRANTES
    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type !== 'notify') return;

        const msg = messages[0];
        if (!msg.message || msg.key.fromMe) return;

        const numeroRemitente = msg.key.remoteJid;
        const textoMensaje = msg.message.conversation || 
                             msg.message.extendedTextMessage?.text || '';

        if (textoMensaje.toLowerCase().includes('quiero') || textoMensaje.toLowerCase().includes('bebida') || textoMensaje.toLowerCase().includes('hola')) {
            
            console.log(`📥 Enviando catálogo de bebidas al cliente: ${numeroRemitente}`);

            await sock.sendMessage(numeroRemitente, {
                image: { url: "https://ntungxnymcijfxueucoz.supabase.co/storage/v1/object/public/catalogo/catalogo.jpeg" },
                caption: "🍷 *Catálogo de Bebidas con Alcohol*\n\n" +
                         "¡Hola! Acá tenés la imagen con todas las opciones y precios.\n\n" +
                         "📲 Escribinos por acá mismo qué te querés llevar y te pasamos el total para coordinar la entrega. 📦"
            });
        }
    });

    return sock;
}

iniciarSesionWhatsApp();

module.exports = { iniciarSesionWhatsApp };