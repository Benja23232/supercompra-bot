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
        // 🚀 AUTOMATIZACIÓN: Si el pedido seguía pendiente, al entrar a armar pasa automáticamente a "En Proceso"
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

          dataPedido.estado = nuevoEstadoAuto; // Actualizamos localmente
          
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
      // 1. Descontamos el stock físico
      for (const item of detalles) {
        const stockActual = item.productos?.stock_fisico || 0;
        const nuevoStock = stockActual - item.cantidad;

        await supabase
          .from('productos')
          .update({ stock_fisico: nuevoStock >= 0 ? nuevoStock : 0 }) 
          .eq('id_producto', item.id_producto);
      }

      // 2. Registramos en la Auditoría
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
      <main style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', backgroundColor: '#f3f4f6' }}>
        <p style={{ fontSize: '1.2rem', color: '#6b7280', fontWeight: 'bold' }}>Verificando accesos...</p>
      </main>
    );
  }

  if (loading) return <p className="texto-cargando">Cargando detalles para armado...</p>;
  if (!pedido) return <p className="texto-cargando">No se encontró el pedido.</p>;

  const obtenerBadgeEnvio = (estado: string) => {
    if (estado?.includes('Full')) return { texto: '🚀 ENVÍO FULL', fondo: '#f3e8ff', color: '#7e22ce', borde: '#d8b4fe' };
    if (estado?.includes('Mañana')) return { texto: '☀️ TURNO MAÑANA', fondo: '#fef9c3', color: '#854d0e', borde: '#fde047' };
    if (estado?.includes('Tarde')) return { texto: '🌙 TURNO TARDE', fondo: '#e0f2fe', color: '#0369a1', borde: '#7dd3fc' };
    return { texto: '📦 ESTÁNDAR', fondo: '#f3f4f6', color: '#374151', borde: '#e5e7eb' };
  };

  const badge = obtenerBadgeEnvio(pedido.estado);
  const todosListos = detalles.length > 0 && detalles.every(item => productosMarcados[item.id_producto]);

  return (
    <main className="contenedor-pagina" style={{ maxWidth: '800px', margin: '0 auto', padding: '20px' }}>
      <Link href="/pedidos" className="link-volver" style={{ display: 'inline-block', marginBottom: '20px', color: '#2563eb', textDecoration: 'none' }}>
        🔙 Volver a la lista de pedidos
      </Link>

      <div className="encabezado-pagina" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '10px' }}>
        <h1 className="titulo-pagina" style={{ fontSize: '1.8rem' }}>Armar Pedido #{String(pedido.id_pedido).slice(0, 8)}</h1>
        <span style={{ backgroundColor: badge.fondo, color: badge.color, border: `1px solid ${badge.borde}`, padding: '6px 12px', borderRadius: '20px', fontWeight: 'bold', fontSize: '0.9rem' }}>
          {badge.texto}
        </span>
      </div>

      <div style={{ marginBottom: '20px', background: '#18181b', padding: '15px', borderRadius: '8px', border: '1px solid #3f3f46', color: '#fff' }}>
        <p style={{ margin: '5px 0' }}><strong>Teléfono del cliente:</strong> +{pedido.whatsapp_id}</p>
        <p style={{ margin: '5px 0' }}><strong>Dirección de entrega:</strong> {pedido.direccion || 'No especificada'}</p>
        <p style={{ margin: '5px 0' }}><strong>Estado actual:</strong> {pedido.estado} <span style={{ color: '#10b981', fontSize: '0.85rem' }}>(⚡ En proceso automático)</span></p>
        <p style={{ margin: '5px 0' }}><strong>Total abonado:</strong> ${pedido.total_compra}</p>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '10px' }}>
        <h2>Lista de Picking (Marcar productos recolectados):</h2>
        {todosListos && (
          <span style={{ color: '#16a34a', fontWeight: 'bold', backgroundColor: '#dcfce7', padding: '4px 10px', borderRadius: '15px', fontSize: '0.9rem' }}>
            ✅ ¡Pedido completo!
          </span>
        )}
      </div>

      <div className="contenedor-tabla" style={{ marginTop: '10px', marginBottom: '20px' }}>
        <table className="tabla-datos" style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid #e5e7eb' }}>
              <th className="texto-centro" style={{ textAlign: 'center', padding: '10px', width: '60px' }}>Listo</th>
              <th className="texto-izq" style={{ textAlign: 'left', padding: '10px' }}>Producto</th>
              <th className="texto-centro" style={{ textAlign: 'center', padding: '10px' }}>Cantidad</th>
            </tr>
          </thead>
          <tbody>
            {detalles.map((item, index) => {
              const estaMarcado = productosMarcados[item.id_producto];
              return (
                <tr key={index} style={{ borderBottom: '1px solid #f3f4f6', backgroundColor: estaMarcado ? '#f3f4f6' : '#fff', opacity: estaMarcado ? 0.6 : 1, transition: 'all 0.2s ease-in-out' }}>
                  <td className="texto-centro" style={{ textAlign: 'center', padding: '10px' }}>
                    <input 
                      type="checkbox" 
                      checked={estaMarcado || false}
                      onChange={() => toggleMarca(item.id_producto)}
                      style={{ width: '22px', height: '22px', cursor: 'pointer' }}
                    />
                  </td>
                  <td className="font-fuerte" style={{ padding: '10px', textDecoration: estaMarcado ? 'line-through' : 'none', color: '#000' }}>
                    {item.productos?.nombre || 'Producto desconocido'}
                  </td>
                  <td className="texto-centro" style={{ textAlign: 'center', padding: '10px', textDecoration: estaMarcado ? 'line-through' : 'none', color: '#000' }}>
                    <strong style={{ fontSize: '1.1rem' }}>{item.cantidad}</strong>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {todosListos && (
        <button 
          onClick={confirmarArmadoYDescontar}
          disabled={procesando}
          style={{ 
            width: '100%', 
            padding: '15px', 
            backgroundColor: procesando ? '#9ca3af' : '#16a34a', 
            color: '#fff', 
            border: 'none', 
            borderRadius: '8px', 
            fontSize: '1.1rem', 
            fontWeight: 'bold', 
            cursor: procesando ? 'not-allowed' : 'pointer' 
          }}
        >
          {procesando ? 'Descontando stock...' : '📦 Confirmar Armado y Descontar Stock'}
        </button>
      )}
    </main>
  );
}