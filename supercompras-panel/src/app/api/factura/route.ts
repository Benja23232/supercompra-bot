import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import PDFDocument from 'pdfkit';

export async function POST(request: Request) {
  try {
    const pedido = await request.json();
    const telefonoCrudo = pedido.cliente_telefono;
    
    if (!telefonoCrudo || !pedido.productos || pedido.productos.length === 0) {
      return NextResponse.json({ success: false, error: 'Faltan datos del pedido o teléfono' }, { status: 400 });
    }

    // 1. Generar el PDF en memoria usando pdfkit
    const pdfBuffer: Buffer = await new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 50 });
      const buffers: any[] = [];
      
      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', reject);

      doc.fontSize(20).text('COMPROBANTE DE VENTA', { align: 'center' });
      doc.fontSize(10).fillColor('gray').text('Documento no válido como factura', { align: 'center' });
      doc.moveDown();

      const fecha = new Date().toLocaleDateString('es-AR');
      doc.fillColor('black').fontSize(12);
      doc.text(`Fecha: ${fecha}`);
      doc.text(`Cliente: ${pedido.cliente_nombre || 'Consumidor Final'}`);
      doc.text(`Nº de Pedido: #${String(pedido.id_pedido || Math.floor(Math.random() * 10000)).slice(0, 8)}`);
      doc.moveDown();

      doc.fontSize(10).fillColor('#2980b9');
      doc.text('Cant. | Descripción | Precio Unit. | Subtotal', { underline: true });
      doc.moveDown(0.5);

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

    // 2. Subir el PDF a Supabase Storage
    const nombreArchivo = `ticket_${Date.now()}.pdf`;
    const { error: uploadError } = await supabase.storage
      .from('comprobantes')
      .upload(nombreArchivo, pdfBuffer, {
        contentType: 'application/pdf',
        upsert: false
      });

    if (uploadError) {
      console.error("❌ Error de Supabase al subir:", uploadError);
      throw new Error(`Error al subir PDF: ${uploadError.message}`);
    }

    // 3. Obtener la URL pública del PDF
    const { data: publicUrlData } = supabase.storage
      .from('comprobantes')
      .getPublicUrl(nombreArchivo);

    const pdfUrl = publicUrlData.publicUrl;

    // 4. Limpiar teléfono para que Meta lo acepte
    const telefonoLimpio = telefonoCrudo.toString().replace(/[^0-9]/g, '');

    // 5. Enviar el PDF por WhatsApp vía Meta API
    // IMPORTANTE: Asegúrate de tener estas dos variables en Vercel
    const accessToken = process.env.WHATSAPP_TOKEN;
    const phoneNumberId = process.env.WHATSAPP_PHONE_ID;

    if (accessToken && phoneNumberId) {
      const responseMeta = await fetch(`https://graph.facebook.com/v17.0/${phoneNumberId}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: telefonoLimpio,
          type: 'document',
          document: {
            link: pdfUrl,
            caption: '¡Acá tenés tu comprobante de compra! 📄',
            filename: 'comprobante_supercompra.pdf' // Obligatorio para Meta
          }
        })
      });

      if (!responseMeta.ok) {
        const errorData = await responseMeta.json();
        console.error("❌ Error de Meta API al enviar WhatsApp:", JSON.stringify(errorData, null, 2));
      } else {
        console.log("✅ PDF enviado exitosamente a Meta.");
      }
    } else {
      console.warn("⚠️ Faltan variables WHATSAPP_TOKEN o WHATSAPP_PHONE_ID en el entorno.");
    }

    return NextResponse.json({ success: true, url: pdfUrl });

  } catch (err: any) {
    console.error("❌ Error general en API de facturación:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}