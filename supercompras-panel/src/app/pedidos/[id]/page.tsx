'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation'; 

export default function DetallePedido() {
  const { id } = useParams(); 
  const router = useRouter();
  const [autorizado, setAutorizado] = useState(false);
  
  const [pedido, setPedido] = useState<any>(null);
  const [detalles, setDetalles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const rol = localStorage.getItem('rolUsuario');
    if (!rol) {
      router.push('/'); 
    } else {
      setAutorizado(true); 
    }
  }, [router]);

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
        .select(`
          cantidad, 
          precio_congelado, 
          id_producto,
          productos (nombre)
        `)
        .eq('id_pedido', id);

      if (dataDetalles) setDetalles(dataDetalles);
      
      setLoading(false);
    }

    if (id && autorizado) fetchDetalleCompleto();
  }, [id, autorizado]);

  if (!autorizado) {
    return (
      <main style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', backgroundColor: '#f3f4f6' }}>
        <p style={{ fontSize: '1.2rem', color: '#6b7280', fontWeight: 'bold' }}>Verificando accesos...</p>
      </main>
    );
  }

  if (loading) return <p className="texto-cargando">Cargando detalles del pedido...</p>;
  if (!pedido) return <p className="texto-cargando">No se encontró el pedido.</p>;

  const obtenerBadgeEnvio = (estado: string) => {
    if (estado?.includes('Full')) return { texto: '🚀 ENVÍO FULL', fondo: '#f3e8ff', color: '#7e22ce', borde: '#d8b4fe' };
    if (estado?.includes('Mañana')) return { texto: '☀️ TURNO MAÑANA', fondo: '#fef9c3', color: '#854d0e', borde: '#fde047' };
    if (estado?.includes('Tarde')) return { texto: '🌙 TURNO TARDE', fondo: '#e0f2fe', color: '#0369a1', borde: '#7dd3fc' };
    return { texto: '📦 ESTÁNDAR', fondo: '#f3f4f6', color: '#374151', borde: '#e5e7eb' };
  };

  const badge = obtenerBadgeEnvio(pedido.estado);

  return (
    <main className="contenedor-pagina" style={{ maxWidth: '800px', margin: '0 auto', padding: '20px' }}>
      <Link href="/pedidos" className="link-volver" style={{ display: 'inline-block', marginBottom: '20px', color: '#2563eb', textDecoration: 'none' }}>
        🔙 Volver a la lista de pedidos
      </Link>

      <div className="encabezado-pagina" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '10px' }}>
        <h1 className="titulo-pagina" style={{ fontSize: '1.8rem' }}>Detalle del Pedido #{String(pedido.id_pedido).slice(0, 8)}</h1>
        <span style={{ backgroundColor: badge.fondo, color: badge.color, border: `1px solid ${badge.borde}`, padding: '6px 12px', borderRadius: '20px', fontWeight: 'bold', fontSize: '0.9rem' }}>
          {badge.texto}
        </span>
      </div>

      <div style={{ marginBottom: '20px', background: '#18181b', padding: '15px', borderRadius: '8px', border: '1px solid #3f3f46', color: '#fff' }}>
        <p style={{ margin: '5px 0' }}><strong>Teléfono del cliente:</strong> +{pedido.whatsapp_id}</p>
        <p style={{ margin: '5px 0' }}><strong>Dirección de entrega:</strong> {pedido.direccion || 'No especificada'}</p>
        <p style={{ margin: '5px 0' }}><strong>Estado actual:</strong> {pedido.estado}</p>
        <p style={{ margin: '5px 0' }}><strong>Total abonado:</strong> ${pedido.total_compra}</p>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '10px' }}>
        <h2>Productos del Pedido (Solo Lectura):</h2>
      </div>

      <div className="contenedor-tabla" style={{ marginTop: '10px', marginBottom: '20px' }}>
        <table className="tabla-datos" style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid #e5e7eb' }}>
              <th className="texto-izq" style={{ textAlign: 'left', padding: '10px' }}>Producto</th>
              <th className="texto-centro" style={{ textAlign: 'center', padding: '10px' }}>Cantidad</th>
              <th className="texto-centro" style={{ textAlign: 'center', padding: '10px' }}>Estado de Armado</th>
            </tr>
          </thead>
          <tbody>
            {detalles.map((item, index) => {
              // Acá podés reflejar si el producto fue marcado (si guardás el estado del check en base de datos o si es modo informativo)
              // Por defecto se muestra informativo de solo lectura
              return (
                <tr key={index} style={{ borderBottom: '1px solid #f3f4f6' }}>
                  <td className="font-fuerte" style={{ padding: '10px', color: '#000' }}>
                    {item.productos?.nombre || 'Producto desconocido'}
                  </td>
                  <td className="texto-centro" style={{ textAlign: 'center', padding: '10px', color: '#000' }}>
                    <strong style={{ fontSize: '1.1rem' }}>{item.cantidad}</strong>
                  </td>
                  <td className="texto-centro" style={{ textAlign: 'center', padding: '10px' }}>
                    <span style={{ backgroundColor: '#f3f4f6', padding: '4px 10px', borderRadius: '12px', fontSize: '0.85rem', color: '#4b5563', fontWeight: 'bold' }}>
                      📋 Pendiente en depósito
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div style={{ display: 'flex', gap: '10px' }}>
        <Link 
          href={`/pedidos/${pedido.id_pedido}/armar`} 
          style={{ 
            display: 'block',
            textAlign: 'center',
            width: '100%', 
            padding: '12px', 
            backgroundColor: '#16a34a', 
            color: '#fff', 
            borderRadius: '8px', 
            fontSize: '1rem', 
            fontWeight: 'bold', 
            textDecoration: 'none' 
          }}
        >
          📦 Ir a Armar este Pedido
        </Link>
      </div>
    </main>
  );
}