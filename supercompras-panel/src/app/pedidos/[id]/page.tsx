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
  const [pago, setPago] = useState<any>(null); 
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
      if (!id) return;

      // 1. Traer Pedido
      const { data: dataPedido, error: errorPedido } = await supabase
        .from('pedidos')
        .select('*')
        .eq('id_pedido', id)
        .maybeSingle();

      if (errorPedido) console.error("Error trayendo pedido:", errorPedido);
      if (dataPedido) setPedido(dataPedido);

      // 2. Traer Productos del Pedido
      const { data: dataDetalles, error: errorDetalles } = await supabase
        .from('detalle_pedidos')
        .select(`
          cantidad, 
          precio_congelado, 
          id_producto,
          productos (nombre)
        `)
        .eq('id_pedido', id);

      if (errorDetalles) console.error("Error trayendo detalles:", errorDetalles);
      if (dataDetalles) setDetalles(dataDetalles);
      
      // 3. Traer Pago Asociado
      const { data: dataPago, error: errorPago } = await supabase
        .from('pagos')
        .select('metodo, estado, monto')
        .eq('id_pedido', id)
        .maybeSingle(); 

      if (errorPago) console.error("Error trayendo pago:", errorPago);

      if (dataPago) {
        setPago(dataPago);
      } else {
        setPago(null);
      }
      
      setLoading(false);
    }

    if (id && autorizado) {
      fetchDetalleCompleto();
    }
  }, [id, autorizado]);

  if (!autorizado) {
    return (
      <main style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', backgroundColor: '#0a0a0a', color: '#9ca3af' }}>
        <p style={{ fontSize: '1.2rem', fontWeight: 'bold' }}>Verificando accesos...</p>
      </main>
    );
  }

  if (loading) return <div style={{ textAlign: 'center', padding: '40px', color: '#a1a1aa', fontSize: '1.1rem', backgroundColor: '#0a0a0a', minHeight: '100vh' }}>Cargando detalles del pedido...</div>;
  if (!pedido) return <div style={{ textAlign: 'center', padding: '40px', color: '#a1a1aa', fontSize: '1.1rem', backgroundColor: '#0a0a0a', minHeight: '100vh' }}>No se encontró el pedido.</div>;

  const obtenerBadgeEnvio = (estado: string) => {
    if (estado?.includes('Full')) return { texto: '🚀 ENVÍO FULL', fondo: '#3b0764', color: '#e9d5ff', borde: '#6b21a8' };
    if (estado?.includes('Mañana')) return { texto: '☀️ TURNO MAÑANA', fondo: '#422006', color: '#fef08a', borde: '#854d0e' };
    if (estado?.includes('Tarde')) return { texto: '🌙 TURNO TARDE', fondo: '#082f49', color: '#bae6fd', borde: '#0369a1' };
    if (estado?.includes('Retiro')) return { texto: '🏪 RETIRO EN LOCAL', fondo: '#064e3b', color: '#a7f3d0', borde: '#047857' };
    if (estado?.includes('Armado')) return { texto: '📦 ARMADO / LISTO', fondo: '#065f46', color: '#d1fae5', borde: '#10b981' };
    return { texto: '⚠️ EN PROCESO', fondo: '#27272a', color: '#f4f4f5', borde: '#3f3f46' };
  };

  const badge = obtenerBadgeEnvio(pedido.estado);

  // Analizador inteligente de turno (detecta en el texto o deduce por la hora de creación)
  const parsearEstadoYTurno = (estado: string, fechaCreacion: string) => {
    let turnoTexto = '';

    // 1. Si el estado ya trae explícitamente el turno
    if (estado?.includes('Full')) {
      turnoTexto = '🚀 Envío Full (Inmediato)';
    } else if (estado?.includes('Mañana')) {
      turnoTexto = '☀️ Turno Mañana (09:30 a 11:00 hs)';
    } else if (estado?.includes('Tarde')) {
      turnoTexto = '🌙 Turno Tarde (19:00 a 20:30 hs)';
    } else if (estado?.includes('Retiro')) {
      turnoTexto = '🏪 Retiro en Depósito (Mitre 1044)';
    } else {
      // 2. Si es genérico, lo deducimos por la hora en que se creó el pedido
      if (fechaCreacion) {
        const horaPedido = new Date(fechaCreacion).getHours();
        // Si el pedido se hizo de noche o madrugada/mañana (antes de las 14hs), va a la mañana; sino a la tarde
        if (horaPedido >= 9 && horaPedido < 14) {
          turnoTexto = '☀️ Turno Mañana (Asignado por horario)';
        } else {
          turnoTexto = '🌙 Turno Tarde (Asignado por horario)';
        }
      } else {
        turnoTexto = '🌙 Turno Tarde (Estándar)';
      }
    }

    let estadoLimpio = estado
      .replace(' - Mañana', '')
      .replace(' - Tarde', '')
      .replace(' - Full', '');

    return { estadoLimpio, turnoTexto };
  };

  const { estadoLimpio, turnoTexto } = parsearEstadoYTurno(pedido.estado, pedido.fecha_creacion);

  const obtenerDetallePago = () => {
    if (!pago) {
      return (
        <span style={{ color: '#fbbf24' }}>
          ⏳ <strong>Sin registro de pago digital</strong> <span style={{ fontSize: '0.8rem', color: '#a1a1aa' }}>(Pedido antiguo o incompleto)</span>
        </span>
      );
    }
    
    if (pago.metodo === 'Transferencia') {
      const aprobado = pago.estado === 'Aprobado' || pago.estado === 'Aprobado por IA';
      return (
        <span>
          🏦 <strong>Transferencia</strong> — <span style={{ color: aprobado ? '#4ade80' : '#f87171', fontWeight: 'bold' }}>
            {aprobado ? '✅ Comprobante validado / Aprobado' : '⚠️ Pendiente de revisión'}
          </span>
        </span>
      );
    } else {
      return (
        <span>
          💵 <strong>Efectivo</strong> — <span style={{ color: '#60a5fa', fontWeight: 'bold' }}>Pagá al recibir o retirar ({pago.estado || 'A Cobrar'})</span>
        </span>
      );
    }
  };

  return (
    <main style={{ maxWidth: '800px', margin: '0 auto', padding: '20px', backgroundColor: '#0a0a0a', minHeight: '100vh', color: '#f4f4f5', fontFamily: 'sans-serif', boxSizing: 'border-box' }}>
      <div style={{ marginBottom: '20px' }}>
        <Link href="/pedidos" style={{ color: '#818cf8', textDecoration: 'none', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '5px', width: 'fit-content' }}>
          🔙 Volver a la lista de pedidos
        </Link>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '15px' }}>
        <h1 style={{ fontSize: '1.8rem', margin: 0, color: '#f4f4f5' }}>
          Detalle del Pedido #{String(pedido.id_pedido).slice(0, 8)}
        </h1>
        <span style={{ backgroundColor: badge.fondo, color: badge.color, border: `1px solid ${badge.borde}`, padding: '6px 14px', borderRadius: '20px', fontWeight: 'bold', fontSize: '0.85rem' }}>
          {badge.texto}
        </span>
      </div>

      <div style={{ marginBottom: '25px', backgroundColor: '#121214', padding: '20px', borderRadius: '12px', border: '1px solid #27272a', boxShadow: '0 4px 6px rgba(0,0,0,0.4)', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <p style={{ margin: '0', fontSize: '1.05rem', color: '#f4f4f5' }}>
          ⚙️ <strong>Estado Actual:</strong> <span style={{ color: '#38bdf8', fontWeight: 'bold' }}>{estadoLimpio}</span>
        </p>
        <p style={{ margin: '0', fontSize: '1.05rem', color: '#f4f4f5' }}>
          🚚 <strong>Turno / Logística:</strong> <span style={{ color: '#a7f3d0', fontWeight: 'bold' }}>{turnoTexto}</span>
        </p>
        <p style={{ margin: '0', color: '#f4f4f5' }}><strong>📞 Teléfono del cliente:</strong> +{pedido.whatsapp_id}</p>
        <p style={{ margin: '0', color: '#f4f4f5' }}><strong>📍 Dirección de entrega:</strong> {pedido.direccion || 'No especificada'}</p>
        <p style={{ margin: '0', color: '#f4f4f5' }}><strong>💳 Método de pago:</strong> {obtenerDetallePago()}</p>
        <p style={{ margin: '0', fontSize: '1.1rem', marginTop: '5px', color: '#f4f4f5' }}><strong>💰 Total abonado:</strong> <span style={{ color: '#4ade80', fontWeight: 'bold' }}>${pedido.total_compra}</span></p>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
        <h2 style={{ fontSize: '1.2rem', margin: 0, color: '#f4f4f5' }}>Productos del Pedido:</h2>
      </div>

      <div style={{ backgroundColor: '#121214', borderRadius: '12px', border: '1px solid #27272a', overflow: 'hidden', marginBottom: '25px', boxShadow: '0 4px 6px rgba(0,0,0,0.4)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #27272a', backgroundColor: '#18181b', color: '#a1a1aa', fontSize: '0.85rem', textTransform: 'uppercase' }}>
              <th style={{ textAlign: 'left', padding: '12px' }}>Producto</th>
              <th style={{ textAlign: 'center', padding: '12px', width: '100px' }}>Cantidad</th>
              <th style={{ textAlign: 'center', padding: '12px', width: '160px' }}>Estado de Armado</th>
            </tr>
          </thead>
          <tbody>
            {detalles.map((item, index) => {
              return (
                <tr key={index} style={{ borderBottom: index < detalles.length - 1 ? '1px solid #27272a' : 'none', backgroundColor: '#121214' }}>
                  <td style={{ padding: '14px', color: '#f4f4f5', fontWeight: '500' }}>
                    {item.productos?.nombre || 'Producto desconocido'}
                  </td>
                  <td style={{ textAlign: 'center', padding: '14px', color: '#f4f4f5' }}>
                    <strong style={{ fontSize: '1.1rem' }}>{item.cantidad}</strong>
                  </td>
                  <td style={{ textAlign: 'center', padding: '14px' }}>
                    <span style={{ backgroundColor: '#27272a', padding: '4px 10px', borderRadius: '12px', fontSize: '0.8rem', color: '#d4d4d8', fontWeight: 'bold', border: '1px solid #3f3f46' }}>
                      📋 En depósito
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
            padding: '14px', 
            backgroundColor: '#16a34a', 
            color: '#fff', 
            borderRadius: '10px', 
            fontSize: '1.05rem', 
            fontWeight: 'bold', 
            textDecoration: 'none',
            boxShadow: '0 4px 12px rgba(22, 163, 74, 0.3)'
          }}
        >
          📦 Ir a Armar este Pedido
        </Link>
      </div>
    </main>
  );
}