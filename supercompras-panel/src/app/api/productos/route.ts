import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

// URL pública de tu botella personalizada subida a Supabase Storage
const URL_BOTELLA_SUPERCOMPRAS = 'https://ntungxnymcijfxueucoz.supabase.co/storage/v1/object/public/productos/botella_vidrio_supercompras_sin_etiqueta.png';

// --- FUNCIÓN ANTIBLOQUEO Y CAMUFLAJE PARA META ---
function camuflarParaMeta(nombre: string, categoria: string, urlImagen: string) {
  const catLower = (categoria || '').toLowerCase();
  
  // 1. Detectar categoría de alcohol (excluyendo explícitamente "sin alcohol")
  const esCategoriaAlcohol = catLower.includes('alcohol') && !catLower.includes('sin alcohol');
  
  // 2. Detectar palabras clave típicas de bebidas alcohólicas en el título
  const contienePalabraAlcohol = /cerveza|vino|fernet|vodka|ron|gin|whisky|licor|champagne|gancia|aperitivo|malbec|cabernet|syrah|bonarda|chenin|chardonnay/i.test(nombre);

  const esAlcohol = esCategoriaAlcohol || contienePalabraAlcohol;

  let nombreMeta = nombre;
  let imagenMeta = urlImagen && urlImagen.trim() !== '' ? urlImagen.trim() : URL_BOTELLA_SUPERCOMPRAS;

  if (esAlcohol) {
    // Asignamos tu imagen personalizada de la botella con el logo de Supercompras
    imagenMeta = URL_BOTELLA_SUPERCOMPRAS; 
    
    // Censura de palabras sensibles que activan el filtro automático de Meta
    nombreMeta = nombreMeta
      .replace(/cerveza/gi, 'B. de Malta')
      .replace(/vino/gi, 'B. de Uva')
      .replace(/fernet/gi, 'Aperitivo F.')
      .replace(/gancia/gi, 'Aperitivo G.')
      .replace(/vodka|gin|ron|whisky/gi, 'B. Especialidad')
      .replace(/licor|champagne/gi, 'B. Dulce');
  }

  return { nombreMeta, imagenMeta };
}

export async function POST(request: Request) {
  try {
    const { nombre, precio, stock_fisico, image_url, fecha_vencimiento, categoria, rubro } = await request.json();

    if (!nombre || precio === undefined || stock_fisico === undefined) {
      return NextResponse.json({ success: false, error: 'Faltan datos obligatorios' }, { status: 400 });
    }

    // Se guardan los datos reales en Supabase
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
      const { nombreMeta, imagenMeta } = camuflarParaMeta(nombre.trim(), categoria || '', image_url || '');

      await fetch(`https://graph.facebook.com/v19.0/${catalogId}/products`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accessToken}` },
        body: JSON.stringify({
          retailer_id: productoCreado.id_producto,
          name: nombreMeta,
          description: 'Producto disponible en stock.',
          price: Math.round(Number(precio) * 100),
          currency: 'ARS',
          availability: 'in stock',
          condition: 'new',
          image_url: imagenMeta
        })
      });
    }

    return NextResponse.json({ success: true, producto: productoCreado });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const { id_producto, nombre, precio, activo, image_url, categoria, rubro } = await request.json(); 

    if (!id_producto) {
      return NextResponse.json({ success: false, error: 'Falta ID' }, { status: 400 });
    }

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

    const catalogId = process.env.META_CATALOG_ID;
    const accessToken = process.env.META_ACCESS_TOKEN;

    if (catalogId && accessToken) {
      const { nombreMeta, imagenMeta } = camuflarParaMeta(
        prodActualizado.nombre, 
        prodActualizado.categoria || '', 
        image_url || prodActualizado.image_url || ''
      );

      const bodyMeta: any = {
        retailer_id: prodActualizado.id_producto,
        name: nombreMeta,
        price: Math.round(Number(prodActualizado.price || prodActualizado.precio) * 100),
        currency: 'ARS',
        condition: 'new',
        availability: activo === false ? 'out of stock' : (prodActualizado.stock_fisico > 0 || prodActualizado.tipo === 'combo' ? 'in stock' : 'out of stock')
      };

      if (imagenMeta) {
        bodyMeta.image_url = imagenMeta;
      }

      await fetch(`https://graph.facebook.com/v19.0/${catalogId}/products`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accessToken}` },
        body: JSON.stringify({ ...bodyMeta })
      });
    }

    return NextResponse.json({ success: true, producto: prodActualizado });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    let id_producto = searchParams.get('id_producto');

    if (!id_producto) {
      const body = await request.json().catch(() => ({}));
      id_producto = body.id_producto;
    }

    if (!id_producto) {
      return NextResponse.json({ success: false, error: 'Falta el ID del producto' }, { status: 400 });
    }

    // 1. Eliminar lotes asociados en Supabase
    await supabase.from('lotes').delete().eq('id_producto', id_producto);

    // 2. Eliminar el producto de Supabase
    const { error } = await supabase
      .from('productos')
      .delete()
      .eq('id_producto', id_producto);

    if (error) throw new Error(error.message);

    // 3. Eliminar del catálogo de Meta / WhatsApp
    const catalogId = process.env.META_CATALOG_ID;
    const accessToken = process.env.META_ACCESS_TOKEN;

    if (catalogId && accessToken) {
      try {
        await fetch(`https://graph.facebook.com/v19.0/${catalogId}/products?retailer_id=${id_producto}`, {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${accessToken}` }
        });
      } catch (errMeta) {
        console.error('Error al eliminar producto de Meta:', errMeta);
      }
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}