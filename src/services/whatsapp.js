const token = process.env.WHATSAPP_TOKEN;
const phoneId = process.env.WHATSAPP_PHONE_ID;
const url = `https://graph.facebook.com/v19.0/${phoneId}/messages`;

// 1. Función para enviar texto común (la que ya usabas)
const enviarMensaje = async (numeroDestino, texto) => {
    const data = {
        messaging_product: 'whatsapp',
        to: numeroDestino,
        type: 'text',
        text: { body: texto }
    };

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
        });

        if (!response.ok) {
            const errorData = await response.json();
            console.log('❌ Error al enviar mensaje de texto:', errorData);
        }
    } catch (error) {
        console.error('❌ Error de conexión en enviarMensaje:', error);
    }
};

// 2. Nueva función para enviar el catálogo en un menú interactivo
const enviarListaProductos = async (numeroDestino, productos) => {
    // Transformamos las filas de la base de datos al formato que exige Meta
    const filas = productos.map(p => ({
        id: `prod_${p.id_producto}`, 
        title: p.nombre.substring(0, 24), // WhatsApp permite hasta 24 caracteres en el título
        description: `Precio: $${p.precio}` // Hasta 72 caracteres
    }));

    const data = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: numeroDestino,
        type: 'interactive',
        interactive: {
            type: 'list',
            header: {
                type: 'text',
                text: '🛒 NUESTRO CATÁLOGO'
            },
            body: {
                text: 'Elegí el producto que estás buscando desde el menú de abajo.'
            },
            footer: {
                text: 'Supercompra'
            },
            action: {
                button: 'Ver productos', // El texto que va a tener el botón principal
                sections: [
                    {
                        title: 'Disponibles actualmente',
                        rows: filas
                    }
                ]
            }
        }
    };

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
        });

        if (!response.ok) {
            const errorData = await response.json();
            console.log('❌ Error al enviar la lista interactiva:', errorData);
        }
    } catch (error) {
        console.error('❌ Error de conexión en enviarListaProductos:', error);
    }
};

const enviarCatalogo = async (numeroDestino, catalogId, productRetailerId) => {
    const data = {
        messaging_product: 'whatsapp',
        to: numeroDestino,
        type: 'interactive',
        interactive: {
            type: 'catalog_message',
            body: {
                text: "¡Hola! Entrá a nuestro catálogo acá abajo 👇 y agregá al carrito lo que necesites."
            },
            action: {
                name: 'catalog_message'
                // Eliminamos los "parameters" que exigían los IDs y causaban el error
            }
        }
    };

    try {
        const response = await fetch(url, { 
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`, 
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
        });

        if (!response.ok) {
            const errorData = await response.json();
            console.log('❌ Error al enviar catálogo:', JSON.stringify(errorData, null, 2));
        } else {
            console.log('✅ Catálogo enviado correctamente a', numeroDestino);
        }
    } catch (error) {
        console.error('❌ Error de conexión en enviarCatalogo:', error);
    }
};

module.exports = { 
    enviarMensaje, 
    enviarListaProductos,
    enviarCatalogo
};