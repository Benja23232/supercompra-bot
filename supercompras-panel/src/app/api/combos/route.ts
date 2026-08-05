import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function POST(request: Request) {
  try {
    const { nombre, precio, image_url, productos_combo } = await request.json();

    if (!nombre || precio === undefined || !productos_combo || productos_combo.length === 0) {
      return NextResponse.json({ success: false, error: 'Faltan datos obligatorios' }, { status: 400 });
    }

    // 1. Crear el producto tipo "combo" (no tiene stock propio, depende de sus partes)
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

    // 2. Armar la "receta" y guardarla en combo_detalle
    const detalles = productos_combo.map((p: any) => ({
      combo_id: comboCreado.id_producto,
      producto_id: p.id_producto,
      cantidad: Number(p.cantidad)
    }));

    const { error: errorDetalles } = await supabase
      .from('combo_detalle')
      .insert(detalles);

    if (errorDetalles) throw new Error(errorDetalles.message);

    // 3. Sincronizar el combo con el catálogo de Meta (WhatsApp)
    const catalogId = process.env.META_CATALOG_ID;
    const accessToken = process.env.META_ACCESS_TOKEN;

    if (catalogId && accessToken) {
      const imagenFinal = image_url && image_url.trim() !== '' 
        ? image_url.trim() 
        : 'https://images.unsplash.com/photo-1556742049-0cfed4f6a45d'; // Imagen de regalo/promo genérica

      await fetch(`https://graph.facebook.com/v19.0/${catalogId}/products`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`
        },
        body: JSON.stringify({
          retailer_id: comboCreado.id_producto,
          name: `✨ ${nombre.trim()}`, // Le agregamos un emoji para que resalte en WhatsApp
          description: 'Promo especial / Combo.',
          price: Math.round(Number(precio) * 100),
          currency: 'ARS',
          availability: 'in stock',
          condition: 'new',
          image_url: imagenFinal
        })
      });
    }

    return NextResponse.json({ success: true, combo: comboCreado });

  } catch (err: any) {
    console.error("Error al crear combo:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}