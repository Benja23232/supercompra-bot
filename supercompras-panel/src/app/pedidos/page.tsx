'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { logAuditoria } from '@/lib/auditoria';

export default function Pedidos() {
  const router = useRouter();
  const [autorizado, setAutorizado] = useState(false);
  const [rolActivo, setRolActivo] = useState('');

  const [pedidos, setPedidos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  // 1. PRIMER FILTRO: Por Turno / Logística
  const [filtro, setFiltro] = useState('todos');

  async function fetchPedidos() {
    setLoading(true);
    const { data, error } = await supabase
      .from('pedidos')
      .select('*')
      .order('fecha_creacion', { ascending: false });

    if (error) console.error("Error al traer pedidos:", error);
    else setPedidos(data || []);
    setLoading(false);
  }

  useEffect(() => {
    const rol = localStorage.getItem('rolUsuario');
    if (!rol) {
      router.push('/'); 
    } else {
      setRolActivo(rol); 
      setAutorizado(true); 
      fetchPedidos();
    }
  }, [router]);

  const cambiarEstado = async (id: any, nuevoEstadoElegido: string, estadoAnterior: string) => {
    let estadoFinal = nuevoEstadoElegido;

    if (nuevoEstadoElegido === 'En Proceso' || nuevoEstadoElegido === 'Entregado') {
      if (estadoAnterior.includes('Mañana')) estadoFinal = `${nuevoEstadoElegido} - Mañana`;
      else if (estadoAnterior.includes('Tarde')) estadoFinal = `${nuevoEstadoElegido} - Tarde`;
      else if (estadoAnterior.includes('Full')) estadoFinal = `${nuevoEstadoElegido} - Full`;
    }

    if (estadoFinal === estadoAnterior) return;

    const { error } = await supabase
      .from('pedidos')
      .update({ estado: estadoFinal })
      .eq('id_pedido', id);

    if (error) {
      alert('Error al actualizar el estado.');
      console.error(error);
    } else {
      await logAuditoria('Pedidos', 'Cambio de estado', `Actualizó el estado del pedido #${String(id).slice(0, 8)} de "${estadoAnterior}" a "${estadoFinal}"`);
      fetchPedidos(); 
    }
  };

  const cerrarSesion = () => {
    localStorage.clear();
    router.push('/');
  };

  const abrirRutaEnMapa = () => {
    const pedidosActivos = pedidosPorTurno.filter(
      p => p.direccion && p.direccion.trim() !== '' && !p.estado?.includes('Entregado') && !p.estado?.includes('Cancelado')
    );

    if (pedidosActivos.length === 0) {
      alert("No hay pedidos activos con dirección cargada en este turno para armar la ruta.");
      return;
    }

    const formatearDir = (dir: string) => {
      const limpia = dir.trim();
      if (limpia.toLowerCase().includes('tres lomas')) return limpia;
      return `${limpia}, Tres Lomas, Buenos Aires`;
    };

    const origen = encodeURIComponent(formatearDir(pedidosActivos[0].direccion));
    const direccionDestino = pedidosActivos[pedidosActivos.length - 1].direccion;
    const destinoFinal = encodeURIComponent(formatearDir(direccionDestino));

    const puntosIntermedios = pedidosActivos.slice(1, -1);
    const waypoints = puntosIntermedios.map(p => encodeURIComponent(formatearDir(p.direccion))).join('|');

    let urlMaps = `https://www.google.com/maps/dir/?api=1&origin=${origen}&destination=${destinoFinal}`;
    if (waypoints.length > 0) urlMaps += `&waypoints=${waypoints}`;
    window.open(urlMaps, '_blank');
  };

  const pedidosPorTurno = pedidos.filter((pedido) => {
    if (filtro === 'todos') return true;
    if (filtro === 'full') return pedido.estado?.includes('Full');
    if (filtro === 'manana') return pedido.estado?.includes('Mañana');
    if (filtro === 'tarde') return pedido.estado?.includes('Tarde');
    return true;
  });

  const pedidosPendientes = pedidosPorTurno.filter(p => !p.estado || p.estado.includes('Pendiente'));
  const pedidosEnProceso = pedidosPorTurno.filter(p => p.estado?.includes('En Proceso'));
  const pedidosFinalizados = pedidosPorTurno.filter(p => p.estado?.includes('Entregado') || p.estado?.includes('Cancelado'));

  if (!autorizado) {
    return (
      <main style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', backgroundColor: '#f3f4f6' }}>
        <p style={{ fontSize: '1.2rem', color: '#6b7280', fontWeight: 'bold' }}>Verificando accesos...</p>
      </main>
    );
  }

  // Objeto para manejar los estilos dinámicos de la pestaña activa
  const tabsInfo: any = {
    todos: { titulo: 'Todos los Pedidos', color: '#2563eb', bg: '#eff6ff', icono: '📋' },
    full: { titulo: 'Envíos Full', color: '#7e22ce', bg: '#f3e8ff', icono: '🚀' },
    manana: { titulo: 'Turnos Mañana', color: '#ca8a04', bg: '#fef9c3', icono: '☀️' },
    tarde: { titulo: 'Turnos Tarde', color: '#0369a1', bg: '#e0f2fe', icono: '🌙' }
  };
  const tabActiva = tabsInfo[filtro];

  const renderTablaPedidos = (lista: any[], tituloSecc: string, colorBorde: string, descripcion: string) => {
    if (lista.length === 0) {
      return (
        <div style={{ marginBottom: '20px', padding: '20px', backgroundColor: '#fff', borderRadius: '12px', borderLeft: `6px solid #e5e7eb`, boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
          <h2 style={{ fontSize: '1.2rem', color: '#374151', margin: '0 0 5px 0' }}>{tituloSecc} (0)</h2>
          <p style={{ color: '#9ca3af', margin: 0, fontSize: '0.9rem' }}>No hay pedidos en esta etapa.</p>
        </div>
      );
    }

    return (
      <div style={{ marginBottom: '25px', backgroundColor: '#fff', borderRadius: '12px', overflow: 'hidden', border: '1px solid #e5e7eb', borderLeft: `6px solid ${colorBorde}`, boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}>
        <div style={{ padding: '15px 20px', borderBottom: '1px solid #e5e7eb', backgroundColor: '#fafafa' }}>
          <h2 style={{ fontSize: '1.3rem', margin: '0 0 5px 0', color: colorBorde }}>{tituloSecc} ({lista.length})</h2>
          <p style={{ margin: 0, fontSize: '0.9rem', color: '#6b7280' }}>{descripcion}</p>
        </div>
        
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #e5e7eb', color: '#4b5563', fontSize: '0.9rem' }}>
                <th style={{ padding: '12px 20px' }}>Nº Pedido</th>
                <th style={{ padding: '12px 20px', textAlign: 'center' }}>Total</th>
                <th style={{ padding: '12px 20px', textAlign: 'center' }}>Mover a...</th>
                <th style={{ padding: '12px 20px', textAlign: 'center' }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {lista.map((pedido) => {
                const estadoActual = pedido.estado || 'Pendiente';
                let valorSelect = estadoActual;
                if (estadoActual.includes('En Proceso')) valorSelect = 'En Proceso';
                if (estadoActual.includes('Entregado')) valorSelect = 'Entregado';
                if (estadoActual.includes('Cancelado')) valorSelect = 'Cancelado';

                return (
                  <tr key={pedido.id_pedido} style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={{ padding: '12px 20px', fontWeight: 'bold', color: '#1f2937' }}>
                      #{String(pedido.id_pedido).slice(0, 8)}...
                    </td>
                    <td style={{ padding: '12px 20px', textAlign: 'center', fontWeight: 'bold', color: '#10b981' }}>
                      ${pedido.total_compra || 0}
                    </td>
                    <td style={{ padding: '12px 20px', textAlign: 'center' }}>
                      <select
                        value={valorSelect}
                        onChange={(e) => cambiarEstado(pedido.id_pedido, e.target.value, estadoActual)}
                        style={{ width: '160px', padding: '0.4rem', borderRadius: '6px', border: '1px solid #d1d5db', cursor: 'pointer', backgroundColor: '#f9fafb', fontSize: '0.9rem' }}
                      >
                        <option value="Pendiente">Pendiente</option>
                        <option value="Pendiente - Mañana">Pendiente - Mañana</option>
                        <option value="Pendiente - Tarde">Pendiente - Tarde</option>
                        <option value="Pendiente - Full">🚀 Pendiente - Full</option>
                        <option value="En Proceso">En Proceso</option>
                        <option value="Entregado">Entregado</option>
                        <option value="Cancelado">Cancelado</option>
                      </select>
                    </td>
                    <td style={{ padding: '12px 20px', textAlign: 'center' }}>
                      <Link 
                        href={`/pedidos/${pedido.id_pedido}`} 
                        style={{ padding: '6px 12px', backgroundColor: '#2563eb', color: '#fff', borderRadius: '6px', textDecoration: 'none', fontSize: '0.85rem', fontWeight: 'bold', display: 'inline-block' }}
                      >
                        👁️ Abrir Pedido
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  return (
    <main style={{ maxWidth: '1100px', margin: '0 auto', padding: '20px', fontFamily: 'system-ui, sans-serif' }}>
      
      {/* BARRA SUPERIOR DE NAVEGACIÓN */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px' }}>
        {rolActivo === 'admin' ? (
          <Link href="/dashboard" style={{ color: '#4b5563', textDecoration: 'none', fontWeight: 'bold', fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '5px' }}>
            <span style={{ fontSize: '1.2rem' }}>🔙</span> Panel Principal
          </Link>
        ) : (
          <button onClick={cerrarSesion} style={{ color: '#dc2626', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 'bold', fontSize: '1rem' }}>
            🔒 Cerrar Sesión
          </button>
        )}
        <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
          <span style={{ fontSize: '0.9rem', color: '#6b7280', fontWeight: 'bold', backgroundColor: '#e5e7eb', padding: '4px 10px', borderRadius: '20px' }}>
            👤 {rolActivo === 'admin' ? 'Administrador' : 'Empleado'}
          </span>
          <button onClick={fetchPedidos} style={{ padding: '6px 12px', borderRadius: '6px', border: '1px solid #d1d5db', backgroundColor: '#fff', cursor: 'pointer', fontWeight: 'bold' }}>
            🔄 Actualizar
          </button>
        </div>
      </div>

      <h1 style={{ fontSize: '2rem', color: '#111827', margin: '0 0 20px 0' }}>Logística y Armado de Pedidos</h1>

      {/* DISEÑO DE PESTAÑAS SUPERIORES */}
      <div style={{ display: 'flex', gap: '5px', borderBottom: '2px solid #e5e7eb', marginBottom: '20px', overflowX: 'auto' }}>
        {['todos', 'full', 'manana', 'tarde'].map((f) => {
          const isActive = filtro === f;
          return (
            <button 
              key={f}
              onClick={() => setFiltro(f)}
              style={{
                padding: '12px 20px',
                border: 'none',
                background: isActive ? tabsInfo[f].bg : 'transparent',
                color: isActive ? tabsInfo[f].color : '#6b7280',
                borderBottom: isActive ? `3px solid ${tabsInfo[f].color}` : '3px solid transparent',
                fontSize: '1rem',
                fontWeight: 'bold',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                transition: 'all 0.2s'
              }}
            >
              {tabsInfo[f].icono} {tabsInfo[f].titulo}
            </button>
          );
        })}
      </div>
      
      {/* BANNER CONTEXTUAL DEL TURNO ACTIVO */}
      <div style={{ backgroundColor: tabActiva.bg, border: `1px solid ${tabActiva.color}`, borderRadius: '12px', padding: '20px', marginBottom: '30px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '15px' }}>
        <div>
          <h2 style={{ margin: '0 0 5px 0', color: tabActiva.color, fontSize: '1.4rem' }}>
            📍 Viendo: {tabActiva.titulo}
          </h2>
          <p style={{ margin: 0, color: '#4b5563', fontSize: '0.95rem' }}>
            Total de pedidos en esta vista: <strong>{pedidosPorTurno.length}</strong>
          </p>
        </div>
        
        <button 
          onClick={abrirRutaEnMapa}
          style={{ backgroundColor: '#16a34a', color: '#fff', border: 'none', padding: '10px 20px', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', fontSize: '1rem', boxShadow: '0 2px 4px rgba(22,163,74,0.3)', display: 'flex', alignItems: 'center', gap: '8px' }}
        >
          🗺️ Generar Ruta de {tabActiva.titulo.replace('Turnos', '').replace('Todos los Pedidos', 'Todo')}
        </button>
      </div>

      {/* CONTENIDO DE LAS TARJETAS (ESTADOS) */}
      {loading ? (
        <p style={{ textAlign: 'center', color: '#6b7280', padding: '40px' }}>Cargando información del depósito...</p>
      ) : (
        <div>
          {renderTablaPedidos(pedidosPendientes, '⏳ 1. Cola de Espera (Pendientes)', '#ca8a04', 'Pedidos ingresados esperando que un empleado los busque en las estanterías.')}
          
          {renderTablaPedidos(pedidosEnProceso, '⚙️ 2. En Armado / Listos para Enviar', '#2563eb', 'Pedidos que ya pasaron por picking, se descontó el stock y están listos para el repartidor.')}
          
          {renderTablaPedidos(pedidosFinalizados, '📦 3. Historial Terminado', '#16a34a', 'Pedidos ya entregados al cliente o cancelados.')}
        </div>
      )}
    </main>
  );
}