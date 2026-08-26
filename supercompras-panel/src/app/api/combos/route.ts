import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function POST(request: Request) {
  try {
    const { nombre, precio, image_url, productos_combo } = await request.json();

    if (!nombre || precio === undefined || !productos_combo || productos_combo.length === 0) {
      return NextResponse.json({ success: false, error: 'Faltan datos obligatorios' }, { status: 400 });
    }

    // 1. Crear el producto tipo "combo" en Supabase
    const { data: comboCreado, error: errorCombo } = await supabase
      .from('productos')
      .insert([{ 
        nombre: nombre.trim(), 
        precio: Number(precio), 
        stock_fisico: 0, 
        tipo: 'combo'
      }])
      .select()
      .single();

    if (errorCombo) throw new Error(errorCombo.message);

    // 2. Guardar la receta en combo_detalle
    const detalles = productos_combo.map((p: any) => ({
      combo_id: comboCreado.id_producto,
      producto_id: p.id_producto,
      cantidad: Number(p.cantidad)
    }));

    const { error: errorDetalles } = await supabase
      .from('combo_detalle')
      .insert(detalles);

    if (errorDetalles) throw new Error(errorDetalles.message);

    // 3. Sincronizar con el Catálogo de Meta (WhatsApp)
    const catalogId = process.env.META_CATALOG_ID;
    const accessToken = process.env.META_ACCESS_TOKEN;
    const phoneNumberId = process.env.META_PHONE_NUMBER_ID;

    const imagenFinal = image_url && image_url.trim() !== '' 
      ? image_url.trim() 
      : 'https://images.unsplash.com/photo-1556742049-0cfed4f6a45d';

    if (catalogId && accessToken) {
      const responseMeta = await fetch(`https://graph.facebook.com/v19.0/${catalogId}/products`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`
        },
        body: JSON.stringify({
          retailer_id: comboCreado.id_producto,
          name: nombre.trim(),
          description: 'Promo especial / Combo.',
          price: Math.round(Number(precio) * 100),
          currency: 'ARS',
          availability: 'in stock',
          condition: 'new',
          image_url: imagenFinal
        })
      });

      const metaData = await responseMeta.json();
      if (!responseMeta.ok) {
        console.error("Error al sincronizar combo con Meta:", metaData);
      }
    }

    // 4. 📢 DIFUSIÓN AUTOMÁTICA A TODOS LOS CLIENTES (Con imagen de la promo)
    if (accessToken && phoneNumberId) {
      const { data: clientes, error: errorClientes } = await supabase
        .from('clientes')
        .select('telefono');

      if (!errorClientes && clientes && clientes.length > 0) {
        const mensajeCaption = `🔥 ¡NUEVA PROMO DISPONIBLE! 🔥\n\n*${nombre.trim()}*\n💰 Precio: $${precio}\n\n¡Mirala en nuestro catálogo y hacé tu pedido por acá! 🚀`;

        for (const cliente of clientes) {
          if (cliente.telefono) {
            try {
              // Verificamos si tenemos una imagen válida para mandar con multimedia, sino mandamos texto plano
              if (image_url && image_url.trim() !== '') {
                await fetch(`https://graph.facebook.com/v19.0/${phoneNumberId}/messages`, {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${accessToken}`
                  },
                  body: JSON.stringify({
                    messaging_product: 'whatsapp',
                    to: cliente.telefono,
                    type: 'image',
                    image: {
                      link: image_url.trim(),
                      caption: mensajeCaption
                    }
                  })
                });
              } else {
                // Si no cargó imagen, va texto directo
                await fetch(`https://graph.facebook.com/v19.0/${phoneNumberId}/messages`, {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${accessToken}`
                  },
                  body: JSON.stringify({
                    messaging_product: 'whatsapp',
                    to: cliente.telefono,
                    type: 'text',
                    text: { body: mensajeCaption }
                  })
                });
              }
            } catch (errEnvio) {
              console.error(`Error al enviar difusión a ${cliente.telefono}:`, errEnvio);
            }
          }
        }
      }
    }

    return NextResponse.json({ success: true, combo: comboCreado });

  } catch (err: any) {
    console.error("Error al crear combo:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}