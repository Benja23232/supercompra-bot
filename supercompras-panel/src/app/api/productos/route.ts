import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function POST(request: Request) {
  try {
    const { nombre, precio, stock_fisico, image_url, fecha_vencimiento } = await request.json();

    if (!nombre || precio === undefined || stock_fisico === undefined) {
      return NextResponse.json({ success: false, error: 'Faltan datos obligatorios' }, { status: 400 });
    }

    // 1. Guardar el Producto en la tabla productos
    const { data: productoCreado, error } = await supabase
      .from('productos')
      .insert([{ 
        nombre: nombre.trim(), 
        precio: Number(precio), 
        stock_fisico: Number(stock_fisico)
      }])
      .select()
      .single();

    if (error) throw new Error(error.message);

    // 2. Si le pusimos stock inicial y fecha, le creamos su PRIMER LOTE
    if (Number(stock_fisico) > 0 && fecha_vencimiento) {
      const { error: errorLote } = await supabase
        .from('lotes')
        .insert([{
          id_producto: productoCreado.id_producto,
          cantidad: Number(stock_fisico),
          fecha_vencimiento: fecha_vencimiento
        }]);
      if (errorLote) console.error("Error al crear lote inicial:", errorLote);
    }

    // 3. Sincronización automática con el Catálogo de WhatsApp
    const catalogId = process.env.META_CATALOG_ID;
    const accessToken = process.env.META_ACCESS_TOKEN;

    if (catalogId && accessToken) {
      const imagenFinal = image_url && image_url.trim() !== '' 
        ? image_url.trim() 
        : 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c';

      const responseMeta = await fetch(`https://graph.facebook.com/v19.0/${catalogId}/products`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`
        },
        body: JSON.stringify({
          retailer_id: productoCreado.id_producto,
          name: nombre.trim(),
          description: 'Producto disponible en stock.',
          price: Math.round(Number(precio) * 100),
          currency: 'ARS',
          availability: Number(stock_fisico) > 0 ? 'in stock' : 'out of stock',
          condition: 'new',
          image_url: imagenFinal
        })
      });

      const metaData = await responseMeta.json();
      if (!responseMeta.ok) console.error("Error al sincronizar con Meta:", metaData);
    }

    return NextResponse.json({ success: true, producto: productoCreado });

  } catch (err: any) {
    console.error("Error en la API de productos:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}