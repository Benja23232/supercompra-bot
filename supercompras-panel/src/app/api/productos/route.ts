import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

// URL pública de tu botella genérica
const URL_BOTELLA_SUPERCOMPRAS = 'https://ntungxnymcijfxueucoz.supabase.co/storage/v1/object/public/productos/botella_vidrio_supercompras_sin_etiqueta.png';

// --- FUNCIÓN SOLO PARA CAMUFLAR EL NOMBRE ---
function obtenerNombreMeta(nombre: string, categoria: string) {
  const catLower = (categoria || '').toLowerCase();
  const esCategoriaAlcohol = catLower.includes('alcohol') && !catLower.includes('sin alcohol');
  const contienePalabraAlcohol = /cerveza|vino|fernet|vodka|ron|gin|whisky|licor|champagne|gancia|aperitivo|malbec|cabernet|syrah|bonarda|chenin|chardonnay/i.test(nombre);

  let nombreMeta = nombre;

  if (esCategoriaAlcohol || contienePalabraAlcohol) {
    nombreMeta = nombreMeta
      .replace(/cerveza/gi, 'B. de Malta')
      .replace(/vino/gi, 'B. de Uva')
      .replace(/fernet/gi, 'Aperitivo F.')
      .replace(/gancia/gi, 'Aperitivo G.')
      .replace(/vodka|gin|ron|whisky/gi, 'B. Especialidad')
      .replace(/licor|champagne/gi, 'B. Dulce');
  }

  return nombreMeta;
}

export async function POST(request: Request) {
  try {
    const { nombre, precio, stock_fisico, image_url, fecha_vencimiento, categoria, rubro } = await request.json();

    if (!nombre || precio === undefined || stock_fisico === undefined) {
      return NextResponse.json({ success: false, error: 'Faltan datos obligatorios' }, { status: 400 });
    }

    const { data: productoCreado, error } = await supabase
      .from('productos')
      .insert([{ 
        nombre: nombre.trim(), 
        precio: Number(precio), 
        stock_fisico: Number(stock_fisico), 
        activo: true,
        categoria: categoria || 'Sin asignar',
        rubro: rubro || null,
        image_url: image_url || null
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
      const nombreMeta = obtenerNombreMeta(nombre.trim(), categoria || '');
      // Al crear, si no hay foto, le mandamos la genérica para que Meta lo acepte
      const imagenMeta = image_url && image_url.trim() !== '' ? image_url.trim() : URL_BOTELLA_SUPERCOMPRAS;

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
    const { id_producto, nombre, precio, activo, image_url, categoria, rubro, stock_fisico } = await request.json(); 

    if (!id_producto) {
      return NextResponse.json({ success: false, error: 'Falta ID' }, { status: 400 });
    }

    // Comprobamos si realmente enviaste una imagen nueva
    const hayNuevaImagen = image_url && image_url.trim() !== '';

    const updateData: any = {};
    if (nombre !== undefined) updateData.nombre = nombre.trim();
    if (precio !== undefined) updateData.precio = Number(precio);
    if (activo !== undefined) updateData.activo = activo;
    if (categoria !== undefined) updateData.categoria = categoria;
    if (rubro !== undefined) updateData.rubro = rubro;
    if (stock_fisico !== undefined) updateData.stock_fisico = Number(stock_fisico);
    
    // Si hay una imagen nueva, la guardamos en Supabase
    if (hayNuevaImagen) {
      updateData.image_url = image_url.trim();
    }

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
      const nombreMeta = obtenerNombreMeta(prodActualizado.nombre, prodActualizado.categoria || '');

      const bodyMeta: any = {
        retailer_id: prodActualizado.id_producto,
        name: nombreMeta,
        price: Math.round(Number(prodActualizado.price || prodActualizado.precio) * 100),
        currency: 'ARS',
        condition: 'new',
        availability: activo === false ? 'out of stock' : (prodActualizado.stock_fisico > 0 || prodActualizado.tipo === 'combo' ? 'in stock' : 'out of stock')
      };

      // ACÁ ESTÁ LA MAGIA:
      // Si subiste una foto nueva, se la mandamos a Meta para que la cambie.
      // Si NO subiste foto, no le mandamos nada y Meta deja intacta la que ya tenía.
      if (hayNuevaImagen) {
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

    await supabase.from('lotes').delete().eq('id_producto', id_producto);

    const { error } = await supabase
      .from('productos')
      .delete()
      .eq('id_producto', id_producto);

    if (error) throw new Error(error.message);

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