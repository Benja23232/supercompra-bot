'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import Link from 'next/link';
import { useParams } from 'next/navigation'; 

export default function DetallePedido() {
  const { id } = useParams(); 
  
  // Agregamos <any> para avisarle que es un objeto de Supabase
  const [pedido, setPedido] = useState<any>(null);
  
  // Agregamos <any[]> para avisarle que es un array de productos
  const [detalles, setDetalles] = useState<any[]>([]);
  
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchDetalleCompleto() {
      const { data: dataPedido, error: errorPedido } = await supabase
        .from('pedidos')
        .select('*')
        .eq('id_pedido', id)
        .single();

      if (dataPedido) setPedido(dataPedido);

      const { data: dataDetalles, error: errorDetalles } = await supabase
        .from('detalle_pedidos')
        .select('cantidad, precio_congelado, id_producto')
        .eq('id_pedido', id);

      if (dataDetalles) setDetalles(dataDetalles);
      
      setLoading(false);
    }

    if (id) fetchDetalleCompleto();
  }, [id]);

  if (loading) return <p className="texto-cargando">Cargando detalles del pedido...</p>;
  if (!pedido) return <p className="texto-cargando">No se encontró el pedido.</p>;

  return (
    <main className="contenedor-pagina">
      <Link href="/pedidos" className="link-volver">
        🔙 Volver a todos los pedidos
      </Link>

      <div className="encabezado-pagina" style={{ marginTop: '20px' }}>
        <h1 className="titulo-pagina">Detalle del Pedido #{String(pedido.id_pedido).slice(0, 8)}</h1>
      </div>

      <div style={{ background: '#f5f5f5', padding: '1rem', borderRadius: '8px', marginBottom: '20px' }}>
        <p><strong>Teléfono del cliente:</strong> +{pedido.whatsapp_id}</p>
        <p><strong>Estado actual:</strong> {pedido.estado}</p>
        <p><strong>Total abonado:</strong> ${pedido.total_compra}</p>
      </div>

      <h2>Productos comprados:</h2>
      <div className="contenedor-tabla" style={{ marginTop: '10px' }}>
        <table className="tabla-datos">
          <thead>
            <tr>
              <th className="texto-izq">Código / ID Producto</th>
              <th className="texto-centro">Cantidad</th>
              <th className="texto-centro">Precio Unitario</th>
              <th className="texto-centro">Subtotal</th>
            </tr>
          </thead>
          <tbody>
            {detalles.map((item, index) => (
              <tr key={index}>
                <td className="font-fuerte">{item.id_producto}</td>
                <td className="texto-centro">{item.cantidad}</td>
                <td className="texto-centro">${item.precio_congelado}</td>
                <td className="texto-centro">${item.cantidad * item.precio_congelado}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}