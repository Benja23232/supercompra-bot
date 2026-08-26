import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function POST(request: Request) {
  try {
    const { id_producto, cantidad, fecha_vencimiento } = await request.json();

    if (!id_producto || !cantidad || !fecha_vencimiento) {
      return NextResponse.json({ success: false, error: 'Faltan datos' }, { status: 400 });
    }

    // 1. Guardar el nuevo lote en la base de datos
    const { error: errorLote } = await supabase
      .from('lotes')
      .insert([{ id_producto, cantidad: Number(cantidad), fecha_vencimiento }]);

    if (errorLote) throw new Error(errorLote.message);

    // 2. Traer el producto actual para sumarle el stock
    const { data: producto, error: errorProd } = await supabase
      .from('productos')
      .select('*')
      .eq('id_producto', id_producto)
      .single();

    if (errorProd) throw new Error(errorProd.message);

    const nuevoStock = producto.stock_fisico + Number(cantidad);

    // 3. Actualizar el stock físico total en el producto
    await supabase
      .from('productos')
      .update({ stock_fisico: nuevoStock })
      .eq('id_producto', id_producto);

    // 4. Sincronizar el nuevo stock total con Meta (WhatsApp)
    const catalogId = process.env.META_CATALOG_ID;
    const accessToken = process.env.META_ACCESS_TOKEN;

    if (catalogId && accessToken) {
      await fetch(`https://graph.facebook.com/v19.0/${catalogId}/products`, {
        method: 'POST', // Meta usa POST para actualizar si el retailer_id ya existe
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`
        },
        body: JSON.stringify({
          retailer_id: producto.id_producto,
          name: producto.nombre,
          price: Math.round(Number(producto.precio) * 100),
          currency: 'ARS',
          availability: nuevoStock > 0 ? 'in stock' : 'out of stock',
          condition: 'new'
        })
      });
    }

    return NextResponse.json({ success: true, nuevoStock });
  } catch (err: any) {
    console.error("Error en Lotes API:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}