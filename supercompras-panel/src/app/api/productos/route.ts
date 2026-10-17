import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function POST(request: Request) {
  try {
    // Se extrae también el 'rubro' del cuerpo de la petición
    const { nombre, precio, stock_fisico, image_url, fecha_vencimiento, categoria, rubro } = await request.json();

    if (!nombre || precio === undefined || stock_fisico === undefined) {
      return NextResponse.json({ success: false, error: 'Faltan datos obligatorios' }, { status: 400 });
    }

    // Se agrega el campo rubro a la inserción
    const { data: productoCreado, error } = await supabase
      .from('productos')
      .insert([{ 
        nombre: nombre.trim(), 
        precio: Number(precio), 
        stock_fisico: Number(stock_fisico), 
        activo: true,
        categoria: categoria || 'Sin asignar',
        rubro: rubro || null
      }])
      .select()
      .single();

    if (error) throw new Error(error.message);

    if (Number(stock_fisico) > 0 && fecha_vencimiento) {
      await supabase.from('lotes').insert([{
        id_producto: productoCreado.id_producto,
        cantidad: Number(stock_fisico),
        fecha_vencimiento: fecha_vencimiento
      }]);
    }

    const catalogId = process.env.META_CATALOG_ID;
    const accessToken = process.env.META_ACCESS_TOKEN;

    if (catalogId && accessToken) {
      const imagenFinal = image_url && image_url.trim() !== '' ? image_url.trim() : 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c';

      await fetch(`https://graph.facebook.com/v19.0/${catalogId}/products`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accessToken}` },
        body: JSON.stringify({
          retailer_id: productoCreado.id_producto,
          name: nombre.trim(),
          description: 'Producto disponible en stock.',
          price: Math.round(Number(precio) * 100),
          currency: 'ARS',
          availability: 'in stock',
          condition: 'new',
          image_url: imagenFinal
        })
      });
    }

    return NextResponse.json({ success: true, producto: productoCreado });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

// Método PUT para editar nombre, precio, foto, categoría, rubro o cambiar visibilidad
export async function PUT(request: Request) {
  try {
    // Se extraen 'categoria' y 'rubro' para que también se puedan editar
    const { id_producto, nombre, precio, activo, image_url, categoria, rubro } = await request.json(); 

    if (!id_producto) {
      return NextResponse.json({ success: false, error: 'Falta ID' }, { status: 400 });
    }

    // 1. Actualizamos Supabase con los campos enviados
    const updateData: any = {};
    if (nombre !== undefined) updateData.nombre = nombre.trim();
    if (precio !== undefined) updateData.precio = Number(precio);
    if (activo !== undefined) updateData.activo = activo;
    if (categoria !== undefined) updateData.categoria = categoria;
    if (rubro !== undefined) updateData.rubro = rubro;

    const { data: prodActualizado, error } = await supabase
      .from('productos')
      .update(updateData)
      .eq('id_producto', id_producto)
      .select()
      .single();

    if (error) throw new Error(error.message);

    // 2. Sincronizar estado y foto con WhatsApp
    const catalogId = process.env.META_CATALOG_ID;
    const accessToken = process.env.META_ACCESS_TOKEN;

    if (catalogId && accessToken) {
      const bodyMeta: any = {
        retailer_id: prodActualizado.id_producto,
        name: prodActualizado.nombre,
        price: Math.round(Number(prodActualizado.price || prodActualizado.precio) * 100),
        currency: 'ARS',
        condition: 'new',
        availability: activo === false ? 'out of stock' : (prodActualizado.stock_fisico > 0 || prodActualizado.tipo === 'combo' ? 'in stock' : 'out of stock')
      };

      // Si desde el frontend nos mandan una imagen nueva, la agregamos al payload de Meta
      if (image_url && image_url.trim() !== '') {
        bodyMeta.image_url = image_url.trim();
      }

      await fetch(`https://graph.facebook.com/v19.0/${catalogId}/products`, {
        method: 'POST', // Meta usa POST para actualizar si el retailer_id ya existe
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accessToken}` },
        body: JSON.stringify(bodyMeta)
      });
    }

    return NextResponse.json({ success: true, producto: prodActualizado });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}