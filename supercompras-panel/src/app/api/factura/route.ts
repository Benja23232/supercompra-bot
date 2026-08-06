import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import PDFDocument from 'pdfkit';

export async function POST(request: Request) {
  try {
    const pedido = await request.json();

    if (!pedido.cliente_telefono || !pedido.productos || pedido.productos.length === 0) {
      return NextResponse.json({ success: false, error: 'Faltan datos del pedido' }, { status: 400 });
    }

    // 1. Generar el PDF en memoria usando pdfkit
    const pdfBuffer: Buffer = await new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 50 });
      const buffers: any[] = [];
      
      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', reject);

      // --- DISEÑO DEL COMPROBANTE ---
      doc.fontSize(20).text('COMPROBANTE DE VENTA', { align: 'center' });
      doc.fontSize(10).fillColor('gray').text('Documento no válido como factura', { align: 'center' });
      doc.moveDown();

      const fecha = new Date().toLocaleDateString('es-AR');
      doc.fillColor('black').fontSize(12);
      doc.text(`Fecha: ${fecha}`);
      doc.text(`Cliente: ${pedido.cliente_nombre || 'Consumidor Final'}`);
      doc.text(`Nº de Pedido: #${pedido.id_pedido || Math.floor(Math.random() * 10000)}`);
      doc.moveDown();

      // Encabezados de la tabla
      doc.fontSize(10).fillColor('#2980b9');
      doc.text('Cant. | Descripción | Precio Unit. | Subtotal', { underline: true });
      doc.moveDown(0.5);

      // Productos
      doc.fillColor('black');
      pedido.productos.forEach((prod: any) => {
        const subtotal = prod.cantidad * prod.precio_unitario;
        doc.text(`${prod.cantidad}x  ${prod.nombre}  -  $${prod.precio_unitario}  ->  $${subtotal}`);
      });

      doc.moveDown();
      doc.fontSize(14).text(`TOTAL: $${pedido.total}`, { align: 'right' });
      
      doc.moveDown(2);
      doc.fontSize(10).fillColor('gray').text('¡Gracias por tu compra!', { align: 'center' });

      doc.end();
    });

    // 2. Subir el PDF a Supabase Storage (al bucket "comprobantes")
    const nombreArchivo = `ticket_${Date.now()}.pdf`;
    const { error: uploadError } = await supabase.storage
      .from('comprobantes')
      .upload(nombreArchivo, pdfBuffer, {
        contentType: 'application/pdf',
        upsert: false
      });

    if (uploadError) throw new Error(`Error al subir PDF: ${uploadError.message}`);

    // 3. Obtener la URL pública del PDF
    const { data: publicUrlData } = supabase.storage
      .from('comprobantes')
      .getPublicUrl(nombreArchivo);

    const pdfUrl = publicUrlData.publicUrl;

    // 4. Enviar el PDF por WhatsApp vía Meta API
    const accessToken = process.env.META_ACCESS_TOKEN;
    const phoneNumberId = process.env.META_PHONE_NUMBER_ID;

    if (accessToken && phoneNumberId) {
      const responseMeta = await fetch(`https://graph.facebook.com/v19.0/${phoneNumberId}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: pedido.cliente_telefono,
          type: 'document',
          document: {
            link: pdfUrl,
            caption: '¡Acá tenés tu comprobante de compra! 📄'
          }
        })
      });

      if (!responseMeta.ok) {
        const errorData = await responseMeta.json();
        console.error("Error al enviar PDF por WhatsApp:", errorData);
      }
    }

    return NextResponse.json({ success: true, url: pdfUrl });

  } catch (err: any) {
    console.error("Error en API de facturación:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}