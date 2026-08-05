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

  // Renderizado de las tablas RECUPERANDO TUS CLASES ORIGINALES (tabla-datos, contenedor-tabla, etc)
  const renderTablaPedidos = (lista: any[], tituloSecc: string, colorBorde: string, descripcion: string) => {
    if (lista.length === 0) {
      return (
        <div style={{ marginBottom: '20px', padding: '20px', backgroundColor: '#fff', borderRadius: '8px', borderLeft: `6px solid #e5e7eb`, boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
          <h2 style={{ fontSize: '1.2rem', color: '#374151', margin: '0 0 5px 0' }}>{tituloSecc} (0)</h2>
          <p style={{ color: '#9ca3af', margin: 0, fontSize: '0.9rem' }}>No hay pedidos en esta etapa.</p>
        </div>
      );
    }

    return (
      <div style={{ marginBottom: '35px', backgroundColor: '#fff', borderRadius: '8px', border: '1px solid #e5e7eb', borderLeft: `6px solid ${colorBorde}`, boxShadow: '0 2px 4px rgba(0,0,0,0.05)', overflow: 'hidden' }}>
        <div style={{ padding: '15px 20px', borderBottom: '1px solid #e5e7eb', backgroundColor: '#fafafa' }}>
          <h2 style={{ fontSize: '1.3rem', margin: '0 0 5px 0', color: colorBorde }}>{tituloSecc} ({lista.length})</h2>
          <p style={{ margin: 0, fontSize: '0.9rem', color: '#6b7280' }}>{descripcion}</p>
        </div>
        
        {/* Usamos tu clase contenedor-tabla y le sumamos overflow para móviles */}
        <div className="contenedor-tabla" style={{ overflowX: 'auto', padding: '0' }}>
          {/* Usamos tu clase tabla-datos y forzamos un ancho mínimo para que en celu se pueda scrollear hacia el costado */}
          <table className="tabla-datos" style={{ width: '100%', minWidth: '700px', borderCollapse: 'collapse', margin: '0' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #e5e7eb' }}>
                <th className="texto-izq" style={{ padding: '12px 20px' }}>Nº Pedido</th>
                <th className="texto-centro" style={{ padding: '12px 20px' }}>Total</th>
                <th className="texto-centro" style={{ padding: '12px 20px' }}>Estado y Logística</th>
                <th className="texto-centro" style={{ padding: '12px 20px' }}>Acciones</th>
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
                    <td className="font-fuerte" style={{ padding: '12px 20px' }}>
                      #{String(pedido.id_pedido).slice(0, 8)}...
                    </td>
                    <td className="texto-centro font-fuerte" style={{ padding: '12px 20px' }}>
                      ${pedido.total_compra || 0}
                    </td>
                    <td className="texto-centro" style={{ padding: '12px 20px' }}>
                      <select
                        value={valorSelect}
                        onChange={(e) => cambiarEstado(pedido.id_pedido, e.target.value, estadoActual)}
                        style={{ width: '170px', padding: '0.4rem', borderRadius: '4px', border: '1px solid #ccc', cursor: 'pointer', backgroundColor: '#fff' }}
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
                    <td className="texto-centro" style={{ padding: '12px 20px' }}>
                      <Link 
                        href={`/pedidos/${pedido.id_pedido}`} 
                        style={{ padding: '0.4rem 0.8rem', backgroundColor: '#2563eb', color: '#fff', borderRadius: '4px', textDecoration: 'none', fontSize: '0.9rem', fontWeight: 'bold', display: 'inline-block' }}
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
    <main className="contenedor-pagina" style={{ maxWidth: '1100px', margin: '0 auto', padding: '20px' }}>
      
      {/* BARRA SUPERIOR DE NAVEGACIÓN Y PERFIL (Responsiva con flexWrap) */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '15px' }}>
        {rolActivo === 'admin' ? (
          <Link href="/dashboard" className="link-volver" style={{ color: '#2563eb', textDecoration: 'none', fontWeight: 'bold' }}>
            🔙 Volver al panel principal
          </Link>
        ) : (
          <button onClick={cerrarSesion} className="link-volver" style={{ color: '#dc2626', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 'bold', fontSize: '1rem', padding: 0 }}>
            🔒 Cerrar Sesión
          </button>
        )}
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.9rem', color: '#6b7280', fontWeight: 'bold' }}>
            👤 Modo: {rolActivo === 'admin' ? 'Administrador' : 'Empleado'}
          </span>
          <button onClick={fetchPedidos} className="btn btn-secundario" style={{ padding: '0.5rem 1rem', cursor: 'pointer' }}>
            🔄 Actualizar
          </button>
        </div>
      </div>

      <div className="encabezado-pagina" style={{ marginBottom: '20px' }}>
        <h1 className="titulo-pagina" style={{ fontSize: '1.8rem', margin: '0 0 10px 0' }}>🛒 Logística y Armado de Pedidos</h1>
      </div>

      {/* DISEÑO DE PESTAÑAS SUPERIORES (Con scroll horizontal en celulares) */}
      <div style={{ display: 'flex', gap: '5px', borderBottom: '2px solid #e5e7eb', marginBottom: '20px', overflowX: 'auto', whiteSpace: 'nowrap', paddingBottom: '2px' }}>
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
                transition: 'all 0.2s',
                borderRadius: '6px 6px 0 0'
              }}
            >
              {tabsInfo[f].icono} {tabsInfo[f].titulo}
            </button>
          );
        })}
      </div>
      
      {/* BANNER CONTEXTUAL DEL TURNO ACTIVO (Responsivo) */}
      <div style={{ backgroundColor: tabActiva.bg, border: `1px solid ${tabActiva.color}`, borderRadius: '8px', padding: '15px 20px', marginBottom: '30px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '15px' }}>
        <div>
          <h2 style={{ margin: '0 0 5px 0', color: tabActiva.color, fontSize: '1.2rem' }}>
            📍 Viendo: {tabActiva.titulo}
          </h2>
          <p style={{ margin: 0, color: '#4b5563', fontSize: '0.9rem' }}>
            Total de pedidos en esta vista: <strong>{pedidosPorTurno.length}</strong>
          </p>
        </div>
        
        <button 
          onClick={abrirRutaEnMapa}
          style={{ backgroundColor: '#16a34a', color: '#fff', border: 'none', padding: '10px 20px', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', fontSize: '0.95rem', boxShadow: '0 2px 4px rgba(22,163,74,0.3)', display: 'flex', alignItems: 'center', gap: '8px' }}
        >
          🗺️ Generar Ruta de {tabActiva.titulo.replace('Turnos', '').replace('Todos los Pedidos', 'Todo')}
        </button>
      </div>

      {/* CONTENIDO DE LAS TARJETAS (ESTADOS) */}
      {loading ? (
        <p className="texto-cargando">Cargando información del depósito...</p>
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