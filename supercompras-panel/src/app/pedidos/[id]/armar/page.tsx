'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation'; 
import { logAuditoria } from '@/lib/auditoria'; 

export default function ArmarPedido() {
  const { id } = useParams(); 
  const router = useRouter();
  const [autorizado, setAutorizado] = useState(false);
  
  const [pedido, setPedido] = useState<any>(null);
  const [detalles, setDetalles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [procesando, setProcesando] = useState(false);

  const [productosMarcados, setProductosMarcados] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const rol = localStorage.getItem('rolUsuario');
    if (!rol) {
      router.push('/'); 
    } else {
      setAutorizado(true); 
    }
  }, [router]);

  useEffect(() => {
    async function fetchDetalleYAutomatizar() {
      const { data: dataPedido } = await supabase
        .from('pedidos')
        .select('*')
        .eq('id_pedido', id)
        .single();

      if (dataPedido) {
        if (dataPedido.estado?.includes('Pendiente')) {
          let sufijoTurno = '';
          if (dataPedido.estado.includes('Mañana')) sufijoTurno = ' - Mañana';
          else if (dataPedido.estado.includes('Tarde')) sufijoTurno = ' - Tarde';
          else if (dataPedido.estado.includes('Full')) sufijoTurno = ' - Full';

          const nuevoEstadoAuto = `En Proceso${sufijoTurno}`;
          
          await supabase
            .from('pedidos')
            .update({ estado: nuevoEstadoAuto })
            .eq('id_pedido', id);

          dataPedido.estado = nuevoEstadoAuto;
          
          await logAuditoria(
            'Depósito', 
            'Inicio de Armado', 
            `Abrió el pedido #${String(id).slice(0, 8)} y pasó automáticamente a En Proceso.`
          );
        }

        setPedido(dataPedido);
      }

      const { data: dataDetalles } = await supabase
        .from('detalle_pedidos')
        .select(`
          cantidad, 
          precio_congelado, 
          id_producto,
          productos (nombre, stock_fisico)
        `)
        .eq('id_pedido', id);

      if (dataDetalles) setDetalles(dataDetalles);
      setLoading(false);
    }

    if (id && autorizado) fetchDetalleYAutomatizar();
  }, [id, autorizado]);

  const toggleMarca = (idProducto: string) => {
    setProductosMarcados((prev) => ({
      ...prev,
      [idProducto]: !prev[idProducto]
    }));
  };

  const confirmarArmadoYDescontar = async () => {
    const confirmar = window.confirm("¿Estás seguro de cerrar el pedido? Esto descontará el stock de la base de datos y lo dejará listo.");
    if (!confirmar) return;

    setProcesando(true);

    try {
      for (const item of detalles) {
        const stockActual = item.productos?.stock_fisico || 0;
        const nuevoStock = stockActual - item.cantidad;

        await supabase
          .from('productos')
          .update({ stock_fisico: nuevoStock >= 0 ? nuevoStock : 0 }) 
          .eq('id_producto', item.id_producto);
      }

      await logAuditoria(
        'Depósito', 
        'Picking Completado', 
        `Completó el armado del pedido #${String(id).slice(0, 8)} y descontó ${detalles.length} productos del stock.`
      );

      alert("¡Pedido armado y stock actualizado con éxito!");
      router.push('/pedidos'); 

    } catch (error) {
      console.error("Error al procesar:", error);
      alert("Hubo un error al descontar el stock.");
    } finally {
      setProcesando(false);
    }
  };

  if (!autorizado) {
    return (
      <main style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', backgroundColor: '#0a0a0a', color: '#9ca3af' }}>
        <p style={{ fontSize: '1.2rem', fontWeight: 'bold' }}>Verificando accesos...</p>
      </main>
    );
  }

  if (loading) return <div style={{ textAlign: 'center', padding: '40px', color: '#a1a1aa', fontSize: '1.1rem', backgroundColor: '#0a0a0a', minHeight: '100vh' }}>Cargando detalles para armado...</div>;
  if (!pedido) return <div style={{ textAlign: 'center', padding: '40px', color: '#a1a1aa', fontSize: '1.1rem', backgroundColor: '#0a0a0a', minHeight: '100vh' }}>No se encontró el pedido.</div>;

  const obtenerBadgeEnvio = (estado: string) => {
    if (estado?.includes('Full')) return { texto: '🚀 ENVÍO FULL', fondo: '#3b0764', color: '#e9d5ff', borde: '#6b21a8' };
    if (estado?.includes('Mañana')) return { texto: '☀️ TURNO MAÑANA', fondo: '#422006', color: '#fef08a', borde: '#854d0e' };
    if (estado?.includes('Tarde')) return { texto: '🌙 TURNO TARDE', fondo: '#082f49', color: '#bae6fd', borde: '#0369a1' };
    return { texto: '📦 ESTÁNDAR', fondo: '#27272a', color: '#f4f4f5', borde: '#3f3f46' };
  };

  const badge = obtenerBadgeEnvio(pedido.estado);
  const todosListos = detalles.length > 0 && detalles.every(item => productosMarcados[item.id_producto]);

  return (
    <main style={{ 
      padding: '20px', 
      backgroundColor: '#0a0a0a', 
      minHeight: '100vh', 
      color: '#f4f4f5',
      fontFamily: 'sans-serif',
      boxSizing: 'border-box',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center'
    }}>
      <div style={{ width: '100%', maxWidth: '800px' }}>
        
        {/* Enlace para Volver */}
        <div style={{ marginBottom: '20px' }}>
          <Link href="/pedidos" style={{ color: '#818cf8', textDecoration: 'none', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '5px', width: 'fit-content' }}>
            🔙 Volver a la lista de pedidos
          </Link>
        </div>

        {/* Encabezado */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '15px' }}>
          <h1 style={{ fontSize: '1.8rem', margin: 0, color: '#f4f4f5' }}>
            Armar Pedido #{String(pedido.id_pedido).slice(0, 8)}
          </h1>
          <span style={{ backgroundColor: badge.fondo, color: badge.color, border: `1px solid ${badge.borde}`, padding: '6px 14px', borderRadius: '20px', fontWeight: 'bold', fontSize: '0.85rem' }}>
            {badge.texto}
          </span>
        </div>

        {/* Tarjeta de Información del Cliente */}
        <div style={{ marginBottom: '25px', backgroundColor: '#121214', padding: '20px', borderRadius: '12px', border: '1px solid #27272a', boxShadow: '0 4px 6px rgba(0,0,0,0.4)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <p style={{ margin: 0, color: '#f4f4f5', fontSize: '1.05rem' }}>
            👤 <strong>Cliente:</strong> {pedido.nombre_cliente || 'Sin nombre'}
          </p>
          <p style={{ margin: 0, color: '#f4f4f5', fontSize: '1rem' }}>
            📞 <strong>Teléfono:</strong> +{pedido.whatsapp_id || pedido.telefono || 'No especificado'}
          </p>
          <p style={{ margin: 0, color: '#f4f4f5', fontSize: '1rem' }}>
            📍 <strong>Dirección de entrega:</strong> {pedido.direccion || 'No especificada'}
          </p>
          <p style={{ margin: 0, color: '#f4f4f5', fontSize: '1rem' }}>
            ⚙️ <strong>Estado actual:</strong> {pedido.estado} <span style={{ color: '#10b981', fontSize: '0.85rem', fontWeight: 'bold' }}>(⚡ En proceso automático)</span>
          </p>
          <p style={{ margin: 0, color: '#f4f4f5', fontSize: '1.1rem' }}>
            💰 <strong>Total abonado:</strong> <span style={{ color: '#10b981', fontWeight: 'bold' }}>${pedido.total_compra}</span>
          </p>
        </div>

        {/* Subtítulo de Picking */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
          <h2 style={{ fontSize: '1.2rem', margin: 0, color: '#f4f4f5' }}>Lista de Picking (Marcar productos recolectados):</h2>
          {todosListos && (
            <span style={{ color: '#4ade80', fontWeight: 'bold', backgroundColor: '#064e3b', border: '1px solid #065f46', padding: '5px 12px', borderRadius: '15px', fontSize: '0.85rem' }}>
              ✅ ¡Pedido completo!
            </span>
          )}
        </div>

        {/* Tabla / Contenedor de Productos */}
        <div style={{ backgroundColor: '#121214', borderRadius: '12px', border: '1px solid #27272a', overflow: 'hidden', marginBottom: '25px', boxShadow: '0 4px 6px rgba(0,0,0,0.4)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #27272a', backgroundColor: '#18181b', color: '#a1a1aa', fontSize: '0.85rem', textTransform: 'uppercase' }}>
                <th style={{ textAlign: 'center', padding: '12px', width: '70px' }}>Listo</th>
                <th style={{ textAlign: 'left', padding: '12px' }}>Producto</th>
                <th style={{ textAlign: 'center', padding: '12px', width: '100px' }}>Cantidad</th>
              </tr>
            </thead>
            <tbody>
              {detalles.map((item, index) => {
                const estaMarcado = productosMarcados[item.id_producto];
                return (
                  <tr 
                    key={index} 
                    style={{ 
                      borderBottom: index < detalles.length - 1 ? '1px solid #27272a' : 'none', 
                      backgroundColor: estaMarcado ? '#09090b' : '#121214', 
                      opacity: estaMarcado ? 0.5 : 1, 
                      transition: 'all 0.2s ease-in-out' 
                    }}
                  >
                    <td style={{ textAlign: 'center', padding: '14px' }}>
                      <input 
                        type="checkbox" 
                        checked={estaMarcado || false}
                        onChange={() => toggleMarca(item.id_producto)}
                        style={{ width: '20px', height: '20px', cursor: 'pointer', accentColor: '#2563eb' }}
                      />
                    </td>
                    <td style={{ padding: '14px', textDecoration: estaMarcado ? 'line-through' : 'none', color: estaMarcado ? '#71717a' : '#f4f4f5', fontWeight: '500' }}>
                      {item.productos?.nombre || 'Producto desconocido'}
                    </td>
                    <td style={{ textAlign: 'center', padding: '14px', textDecoration: estaMarcado ? 'line-through' : 'none', color: estaMarcado ? '#71717a' : '#f4f4f5' }}>
                      <strong style={{ fontSize: '1.1rem' }}>{item.cantidad}</strong>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Botón de Confirmación */}
        {todosListos && (
          <button 
            onClick={confirmarArmadoYDescontar}
            disabled={procesando}
            style={{ 
              width: '100%', 
              padding: '16px', 
              backgroundColor: procesando ? '#3f3f46' : '#16a34a', 
              color: '#fff', 
              border: 'none', 
              borderRadius: '10px', 
              fontSize: '1.05rem', 
              fontWeight: 'bold', 
              cursor: procesando ? 'not-allowed' : 'pointer',
              boxShadow: '0 4px 12px rgba(22, 163, 74, 0.3)',
              transition: 'background-color 0.2s'
            }}
          >
            {procesando ? 'Descontando stock...' : '📦 Confirmar Armado y Descontar Stock'}
          </button>
        )}

      </div>
    </main>
  );
}