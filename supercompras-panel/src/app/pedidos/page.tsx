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
  
  const [alertaNuevoPedido, setAlertaNuevoPedido] = useState(false);
  const [filtro, setFiltro] = useState('todos');

  async function fetchPedidos() {
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

    const channel = supabase
      .channel('cambios-pedidos-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'pedidos' },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            setAlertaNuevoPedido(true);
            setTimeout(() => setAlertaNuevoPedido(false), 6000);
          }
          fetchPedidos();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [router]);

  const cambiarEstado = async (id: any, nuevoEstadoElegido: string, estadoAnterior: string) => {
    let estadoFinal = nuevoEstadoElegido;

    if (['Pendiente', 'En Proceso', 'Entregado', 'Cancelado'].includes(nuevoEstadoElegido)) {
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
      await logAuditoria(
        'Pedidos',
        'Cambio de estado',
        `Actualizó el estado del pedido #${String(id).slice(0, 8)} de "${estadoAnterior}" a "${estadoFinal}"`
      );
      fetchPedidos(); 
    }
  };

  const cerrarSesion = () => {
    localStorage.clear();
    router.push('/');
  };

  // Función para abrir una dirección puntual en Google Maps
  const abrirDireccionIndividual = (direccion: string) => {
    if (!direccion || direccion.trim() === '') {
      alert("Este pedido no tiene dirección cargada.");
      return;
    }
    const limpia = direccion.trim();
    const dirFinal = limpia.toLowerCase().includes('tres lomas') ? limpia : `${limpia}, Tres Lomas, Buenos Aires`;
    window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(dirFinal)}`, '_blank');
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
    
    if (waypoints.length > 0) {
      urlMaps += `&waypoints=${waypoints}`;
    }

    window.open(urlMaps, '_blank');
  };

  const formatearFecha = (fechaIso: string) => {
    if (!fechaIso) return '-';
    const fecha = new Date(fechaIso);
    return fecha.toLocaleDateString('es-AR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
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

  const renderSeccionPedidos = (lista: any[], tituloSecc: string, descripcion: string) => {
    if (lista.length === 0) {
      return (
        <div style={{ marginBottom: '30px', padding: '15px', background: '#2e2f31', borderRadius: '8px', border: '1px solid #d1d5db' }}>
          <h2 style={{ fontSize: '1.4rem', margin: '0 0 5px 0' }}>{tituloSecc} (0)</h2>
          <p style={{ color: '#6b7280', margin: 0 }}>No hay pedidos en esta etapa para el turno seleccionado.</p>
        </div>
      );
    }

    return (
      <div style={{ marginBottom: '40px' }}>
        <h2 style={{ fontSize: '1.4rem', margin: '0 0 5px 0' }}>{tituloSecc} ({lista.length})</h2>
        <p style={{ color: '#6b7280', marginBottom: '15px', marginTop: 0 }}>{descripcion}</p>
        
        {/* GRILLA DE TARJETAS RESPONSIVA */}
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', 
          gap: '15px',
          width: '100%' 
        }}>
          {lista.map((pedido) => {
            const estadoActual = pedido.estado || 'Pendiente';

            let valorSelect = estadoActual;
            if (estadoActual.includes('En Proceso')) valorSelect = 'En Proceso';
            else if (estadoActual.includes('Entregado')) valorSelect = 'Entregado';
            else if (estadoActual.includes('Cancelado')) valorSelect = 'Cancelado';
            else if (estadoActual.includes('Pendiente')) valorSelect = 'Pendiente';

            return (
              <div 
                key={pedido.id_pedido} 
                style={{ 
                  backgroundColor: '#242526', 
                  border: '1px solid #3a3b3c', 
                  borderRadius: '10px', 
                  padding: '16px',
                  boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '10px'
                }}
              >
                {/* Cabecera: Nº Pedido y Total */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: 'bold', fontSize: '1.1rem', color: '#fff' }}>
                    #{String(pedido.id_pedido).slice(0, 8)}...
                  </span>
                  <span style={{ fontWeight: 'bold', fontSize: '1.1rem', color: '#10b981' }}>
                    ${pedido.total_compra || 0}
                  </span>
                </div>

                {/* Fecha */}
                <div style={{ fontSize: '0.85rem', color: '#9ca3af' }}>
                  📅 {formatearFecha(pedido.fecha_creacion)}
                </div>

                {/* DIRECCIÓN CON ACCESO DIRECTO A MAPS */}
                <div style={{ 
                  backgroundColor: '#1a1b1c', 
                  padding: '8px 10px', 
                  borderRadius: '6px', 
                  border: '1px solid #323435',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: '8px'
                }}>
                  <div style={{ fontSize: '0.9rem', color: '#e5e7eb', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    📍 <strong>Dirección:</strong> {pedido.direccion ? pedido.direccion : <span style={{ color: '#ef4444' }}>No especificada</span>}
                  </div>
                  {pedido.direccion && (
                    <button
                      onClick={() => abrirDireccionIndividual(pedido.direccion)}
                      title="Abrir ubicación en Google Maps"
                      style={{
                        background: '#16a34a',
                        color: '#fff',
                        border: 'none',
                        borderRadius: '4px',
                        padding: '4px 8px',
                        cursor: 'pointer',
                        fontSize: '0.8rem',
                        fontWeight: 'bold',
                        whiteSpace: 'nowrap'
                      }}
                    >
                      🗺️ Mapa
                    </button>
                  )}
                </div>

                {/* Selector de Estado y Logística */}
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', color: '#9ca3af', marginBottom: '4px' }}>Estado y Logística:</label>
                  <select
                    value={valorSelect}
                    onChange={(e) => cambiarEstado(pedido.id_pedido, e.target.value, estadoActual)}
                    style={{ 
                      width: '100%',
                      padding: '0.5rem 0.75rem', 
                      borderRadius: '6px', 
                      border: '1px solid #cbd5e1', 
                      cursor: 'pointer', 
                      backgroundColor: '#ffffff', 
                      color: '#1e293b',
                      fontSize: '0.9rem',
                      fontWeight: '500',
                      boxShadow: '0 1px 2px rgba(0, 0, 0, 0.05)',
                      outline: 'none'
                    }}
                  >
                    <option value="Pendiente">Pendiente</option>
                    <option value="Pendiente - Mañana">Pendiente - Mañana</option>
                    <option value="Pendiente - Tarde">Pendiente - Tarde</option>
                    <option value="Pendiente - Full">🚀 Pendiente - Full</option>
                    <option value="En Proceso">En Proceso</option>
                    <option value="Entregado">Entregado</option>
                    <option value="Cancelado">Cancelado</option>
                  </select>
                </div>

                {/* Botones de Acción (Ver Detalle y Armar Pedido) */}
                <div style={{ display: 'flex', gap: '10px', marginTop: '4px' }}>
                  <Link 
                    href={`/pedidos/${pedido.id_pedido}`} 
                    style={{ 
                      flex: 1, 
                      textAlign: 'center', 
                      padding: '10px 8px', 
                      backgroundColor: '#374151', 
                      color: '#fff', 
                      borderRadius: '6px', 
                      textDecoration: 'none', 
                      fontWeight: 'bold', 
                      fontSize: '0.85rem' 
                    }}
                  >
                    👁️ Ver Detalle
                  </Link>
                  <Link 
                    href={`/pedidos/${pedido.id_pedido}/armar`} 
                    style={{ 
                      flex: 1, 
                      textAlign: 'center', 
                      padding: '10px 8px', 
                      backgroundColor: '#2563eb', 
                      color: '#fff', 
                      borderRadius: '6px', 
                      textDecoration: 'none', 
                      fontWeight: 'bold', 
                      fontSize: '0.85rem' 
                    }}
                  >
                    📦 Armar Pedido
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <main className="contenedor-pagina" style={{ width: '100%', boxSizing: 'border-box', position: 'relative' }}>
      
      {alertaNuevoPedido && (
        <div style={{
          position: 'fixed',
          top: '20px',
          right: '20px',
          backgroundColor: '#10b981',
          color: '#fff',
          padding: '15px 25px',
          borderRadius: '8px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
          zIndex: 1000,
          fontWeight: 'bold',
          display: 'flex',
          alignItems: 'center',
          gap: '10px'
        }}>
          <span>🔔 ¡Nuevo pedido ingresado en el sistema!</span>
        </div>
      )}

      {rolActivo === 'admin' ? (
        <Link href="/dashboard" className="link-volver">
          🔙 Volver al panel principal
        </Link>
      ) : (
        <button onClick={cerrarSesion} className="link-volver" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
          🔒 Cerrar Sesión
        </button>
      )}

      <div className="encabezado-pagina" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '15px' }}>
        <h1 className="titulo-pagina" style={{ margin: 0 }}>🛒 Logística y Armado de Pedidos</h1>
        
        <div className="grupo-botones" style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <button 
            onClick={abrirRutaEnMapa} 
            style={{ backgroundColor: '#16a34a', color: '#fff', border: 'none', padding: '0.5rem 1rem', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer' }}
          >
            🗺️ Ruta (Turno Actual)
          </button>
          <button onClick={fetchPedidos} className="btn btn-secundario">
            🔄 Sincronizar
          </button>
        </div>
      </div>

      <div style={{ padding: '20px', background: '#2e2f30', borderRadius: '8px', border: '1px solid #e5e7eb', marginBottom: '30px', marginTop: '20px' }}>
        <h2 style={{ fontSize: '1.2rem', margin: '0 0 15px 0' }}>📍 1. Filtrar por Turno / Envío</h2>
        <div className="grupo-botones" style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <button onClick={() => setFiltro('todos')} className={`btn ${filtro === 'todos' ? 'btn-primario' : 'btn-secundario'}`}>
            📋 Todos ({pedidos.length})
          </button>
          <button onClick={() => setFiltro('full')} className={`btn ${filtro === 'full' ? 'btn-primario' : 'btn-secundario'}`}>
            🚀 Envío Full ({pedidos.filter(p => p.estado?.includes('Full')).length})
          </button>
          <button onClick={() => setFiltro('manana')} className={`btn ${filtro === 'manana' ? 'btn-primario' : 'btn-secundario'}`}>
            ☀️ Mañana ({pedidos.filter(p => p.estado?.includes('Mañana')).length})
          </button>
          <button onClick={() => setFiltro('tarde')} className={`btn ${filtro === 'tarde' ? 'btn-primario' : 'btn-secundario'}`}>
            🌙 Tarde ({pedidos.filter(p => p.estado?.includes('Tarde')).length})
          </button>
        </div>
      </div>
      
      {loading ? (
        <p className="texto-cargando">Cargando ventas del depósito...</p>
      ) : (
        <div style={{ width: '100%' }}>
          {renderSeccionPedidos(pedidosPendientes, '⏳ Cola de Espera (Pendientes)', 'Pedidos ingresados esperando que un empleado los busque en las estanterías.')}
          {renderSeccionPedidos(pedidosEnProceso, '⚙️ En Armado / Listos para Enviar', 'Pedidos que ya pasaron por picking y están listos para el repartidor.')}
          {renderSeccionPedidos(pedidosFinalizados, '📦 Historial Terminado', 'Pedidos ya entregados al cliente o cancelados.')}
        </div>
      )}
    </main>
  );
}