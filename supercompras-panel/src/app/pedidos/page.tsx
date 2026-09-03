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

  // --- NUEVO: Estado para la selección múltiple ---
  const [pedidosSeleccionados, setPedidosSeleccionados] = useState<any[]>([]);
  const [estadoMasivo, setEstadoMasivo] = useState('En Preparación');

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

    if (['Pendiente', 'En Preparación', 'En Reparto', 'Entregado', 'Cancelado'].includes(nuevoEstadoElegido)) {
      if (estadoAnterior.includes('Mañana')) estadoFinal = `${nuevoEstadoElegido} - Mañana`;
      else if (estadoAnterior.includes('Tarde')) estadoFinal = `${nuevoEstadoElegido} - Tarde`;
      else if (estadoAnterior.includes('Full')) estadoFinal = `${nuevoEstadoElegido} - Full`;
    }

    if (estadoFinal === estadoAnterior) return;

    const usuarioLogueado = localStorage.getItem('emailUsuario') || localStorage.getItem('rolUsuario') || 'Sistema';
    const datosActualizacion: any = { estado: estadoFinal };
    if (nuevoEstadoElegido === 'En Reparto') {
      datosActualizacion.repartidor = usuarioLogueado;
    }

    const { error } = await supabase
      .from('pedidos')
      .update(datosActualizacion)
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

  // --- NUEVO: Función para actualizar masivamente los pedidos seleccionados ---
  const cambiarEstadoMasivo = async () => {
    if (pedidosSeleccionados.length === 0) return;

    const usuarioLogueado = localStorage.getItem('emailUsuario') || localStorage.getItem('rolUsuario') || 'Sistema';
    const datosActualizacion: any = { estado: estadoMasivo };
    if (estadoMasivo === 'En Reparto') {
      datosActualizacion.repartidor = usuarioLogueado;
    }

    const { error } = await supabase
      .from('pedidos')
      .update(datosActualizacion)
      .in('id_pedido', pedidosSeleccionados);

    if (error) {
      alert('Error al actualizar los pedidos seleccionados.');
      console.error(error);
    } else {
      await logAuditoria(
        'Pedidos',
        'Cambio de estado masivo',
        `Actualizó ${pedidosSeleccionados.length} pedidos al estado "${estadoMasivo}"`
      );
      setPedidosSeleccionados([]);
      fetchPedidos();
    }
  };

  // --- NUEVO: Manejo de selección individual y general ---
  const toggleSeleccionPedido = (id: any) => {
    if (pedidosSeleccionados.includes(id)) {
      setPedidosSeleccionados(pedidosSeleccionados.filter(item => item !== id));
    } else {
      setPedidosSeleccionados([...pedidosSeleccionados, id]);
    }
  };

  const seleccionarTodosVisibles = () => {
    const idsVisibles = [...pedidosPendientes, ...pedidosEnProceso, ...pedidosEnReparto, ...pedidosFinalizados].map(p => p.id_pedido);
    if (pedidosSeleccionados.length === idsVisibles.length) {
      setPedidosSeleccionados([]);
    } else {
      setPedidosSeleccionados(idsVisibles);
    }
  };

  const cerrarSesion = () => {
    localStorage.clear();
    router.push('/');
  };

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
  const pedidosEnProceso = pedidosPorTurno.filter(p => 
    p.estado?.includes('En Preparación') || 
    p.estado?.includes('En Preparacion') || 
    p.estado?.includes('En Proceso')
  );
  const pedidosEnReparto = pedidosPorTurno.filter(p => p.estado?.includes('En Reparto'));
  const pedidosFinalizados = pedidosPorTurno.filter(p => p.estado?.includes('Entregado') || p.estado?.includes('Cancelado'));

  if (!autorizado) {
    return (
      <main style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', backgroundColor: '#0a0a0a', color: '#9ca3af' }}>
        <p style={{ fontSize: '1.2rem', fontWeight: 'bold' }}>Verificando acceso...</p>
      </main>
    );
  }

  const renderSeccionPedidos = (lista: any[], tituloSecc: string, descripcion: string) => {
    if (lista.length === 0) {
      return (
        <div style={{ marginBottom: '30px', padding: '30px', backgroundColor: '#121214', borderRadius: '12px', border: '1px solid #27272a', textAlign: 'center' }}>
          <span style={{ fontSize: '2.5rem', display: 'block', marginBottom: '10px' }}>
            {tituloSecc.includes('Espera') ? '⏳' : tituloSecc.includes('Armado') ? '⚙️' : tituloSecc.includes('Reparto') ? '🛵' : '✅'}
          </span>
          <h2 style={{ fontSize: '1.3rem', margin: '0 0 5px 0', color: '#f4f4f5' }}>{tituloSecc} (0)</h2>
          <p style={{ color: '#a1a1aa', margin: 0, fontSize: '0.9rem' }}>No hay pedidos en esta etapa para el turno seleccionado.</p>
        </div>
      );
    }

    return (
      <div style={{ marginBottom: '40px', width: '100%' }}>
        <h2 style={{ fontSize: '1.3rem', margin: '0 0 5px 0', color: '#f4f4f5' }}>{tituloSecc} ({lista.length})</h2>
        <p style={{ color: '#a1a1aa', marginBottom: '15px', marginTop: 0, fontSize: '0.9rem' }}>{descripcion}</p>
        
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', 
          gap: '20px', 
          width: '100%' 
        }}>
          {lista.map((pedido) => {
            const estadoActual = pedido.estado || 'Pendiente';
            const estaSeleccionado = pedidosSeleccionados.includes(pedido.id_pedido);

            let valorSelect = estadoActual;
            if (estadoActual.includes('En Preparación') || estadoActual.includes('En Preparacion') || estadoActual.includes('En Proceso')) valorSelect = 'En Preparación';
            else if (estadoActual.includes('En Reparto')) valorSelect = 'En Reparto';
            else if (estadoActual.includes('Entregado')) valorSelect = 'Entregado';
            else if (estadoActual.includes('Cancelado')) valorSelect = 'Cancelado';
            else if (estadoActual.includes('Pendiente')) valorSelect = 'Pendiente';

            return (
              <div 
                key={pedido.id_pedido} 
                style={{ 
                  backgroundColor: '#121214', 
                  border: estaSeleccionado ? '2px solid #6366f1' : '1px solid #27272a', 
                  borderRadius: '12px', 
                  padding: '20px',
                  boxShadow: '0 4px 6px rgba(0,0,0,0.4)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '14px',
                  position: 'relative'
                }}
              >
                {/* Cabecera con Checkbox de selección, Nº Pedido y Total */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #27272a', paddingBottom: '10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <input 
                      type="checkbox" 
                      checked={estaSeleccionado}
                      onChange={() => toggleSeleccionPedido(pedido.id_pedido)}
                      style={{ width: '18px', height: '18px', cursor: 'pointer', accentColor: '#4f46e5' }}
                    />
                    <span style={{ fontWeight: 'bold', fontSize: '1.1rem', color: '#f4f4f5' }}>
                      #{String(pedido.id_pedido).slice(0, 8)}...
                    </span>
                  </div>
                  <span style={{ fontWeight: 'bold', fontSize: '1.2rem', color: '#10b981' }}>
                    ${pedido.total_compra || 0}
                  </span>
                </div>

                {/* Cliente y Fecha */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                  <div style={{ fontSize: '1.05rem', color: '#f4f4f5' }}>
                    👤 <strong>{pedido.nombre_cliente || 'Cliente'}</strong>
                  </div>
                  <div style={{ fontSize: '0.85rem', color: '#a1a1aa', display: 'flex', alignItems: 'center', gap: '5px' }}>
                    📅 {formatearFecha(pedido.fecha_creacion)}
                  </div>
                </div>

                {/* DIRECCIÓN CON ACCESO DIRECTO A MAPS */}
                <div style={{ 
                  backgroundColor: '#09090b', 
                  padding: '10px 12px', 
                  borderRadius: '8px', 
                  border: '1px solid #27272a',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: '8px'
                }}>
                  <div style={{ fontSize: '0.9rem', color: '#e4e4e7', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    📍 <strong>Dirección:</strong> {pedido.direccion ? pedido.direccion : <span style={{ color: '#f87171' }}>No especificada</span>}
                  </div>
                  {pedido.direccion && (
                    <button
                      onClick={() => abrirDireccionIndividual(pedido.direccion)}
                      title="Abrir ubicación en Google Maps"
                      style={{
                        background: '#16a34a',
                        color: '#fff',
                        border: 'none',
                        borderRadius: '6px',
                        padding: '6px 10px',
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

                {/* Selector de Estado y Logística Individual */}
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', color: '#a1a1aa', marginBottom: '6px' }}>Estado y Logística:</label>
                  <select
                    value={valorSelect}
                    onChange={(e) => cambiarEstado(pedido.id_pedido, e.target.value, estadoActual)}
                    style={{ 
                      width: '100%',
                      padding: '0.6rem 0.75rem', 
                      borderRadius: '8px', 
                      border: '1px solid #27272a', 
                      cursor: 'pointer', 
                      backgroundColor: '#09090b', 
                      color: '#f4f4f5',
                      fontSize: '0.9rem',
                      fontWeight: '500',
                      outline: 'none'
                    }}
                  >
                    <option value="Pendiente">Pendiente</option>
                    <option value="Pendiente - Mañana">Pendiente - Mañana</option>
                    <option value="Pendiente - Tarde">Pendiente - Tarde</option>
                    <option value="Pendiente - Full">🚀 Pendiente - Full</option>
                    <option value="En Preparación">⚙️ En Preparación</option>
                    <option value="En Reparto">🛵 En Reparto</option>
                    <option value="Entregado">Entregado</option>
                    <option value="Cancelado">Cancelado</option>
                  </select>
                </div>

                {/* Botones de Acción */}
                <div style={{ display: 'flex', gap: '10px', marginTop: '4px' }}>
                  <Link 
                    href={`/pedidos/${pedido.id_pedido}`} 
                    style={{ 
                      flex: 1, 
                      textAlign: 'center', 
                      padding: '10px 8px', 
                      backgroundColor: '#27272a', 
                      color: '#f4f4f5', 
                      borderRadius: '8px', 
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
                      borderRadius: '8px', 
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
    <main style={{ 
      padding: '20px', 
      backgroundColor: '#0a0a0a', 
      minHeight: '100vh', 
      color: '#f4f4f5',
      fontFamily: 'sans-serif',
      boxSizing: 'border-box',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      paddingBottom: pedidosSeleccionados.length > 0 ? '100px' : '20px' // Espacio para la barra flotante
    }}>
      
      <div style={{ width: '100%', maxWidth: '1400px' }}>

        {alertaNuevoPedido && (
          <div style={{
            position: 'fixed',
            top: '20px',
            right: '20px',
            backgroundColor: '#10b981',
            color: '#fff',
            padding: '15px 25px',
            borderRadius: '8px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
            zIndex: 1000,
            fontWeight: 'bold',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            animation: 'slideIn 0.5s ease-out'
          }}>
            <span>🔔 ¡Nuevo pedido ingresado en el sistema!</span>
          </div>
        )}

        {/* Navegación Superior */}
        <div style={{ marginBottom: '20px', display: 'flex', justifyContent: 'space-between', width: '100%' }}>
          {rolActivo === 'admin' ? (
            <Link href="/dashboard" style={{ color: '#818cf8', textDecoration: 'none', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '5px' }}>
              🔙 Volver al panel principal
            </Link>
          ) : (
            <button onClick={cerrarSesion} style={{ background: 'none', border: 'none', color: '#ef4444', fontWeight: 'bold', fontSize: '0.95rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px' }}>
              🔒 Cerrar Sesión
            </button>
          )}
        </div>

        {/* Cabecera */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '15px', marginBottom: '25px', width: '100%' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: '1.8rem', color: '#f4f4f5', display: 'flex', alignItems: 'center', gap: '10px' }}>
              🛒 Logística y Armado de Pedidos
            </h1>
          </div>
          
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <button 
              onClick={seleccionarTodosVisibles}
              style={{ backgroundColor: '#27272a', color: '#f4f4f5', border: '1px solid #3f3f46', padding: '10px 18px', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', fontSize: '0.9rem' }}
            >
              ☑️ Seleccionar Todos
            </button>
            <button 
              onClick={abrirRutaEnMapa} 
              style={{ backgroundColor: '#16a34a', color: '#fff', border: 'none', padding: '10px 18px', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', display: 'flex', gap: '5px', alignItems: 'center', fontSize: '0.9rem' }}
            >
              🗺️ Ruta (Turno Actual)
            </button>
            <button 
              onClick={fetchPedidos} 
              style={{ backgroundColor: '#27272a', color: '#f4f4f5', border: '1px solid #3f3f46', padding: '10px 18px', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', display: 'flex', gap: '5px', alignItems: 'center', fontSize: '0.9rem' }}
            >
              🔄 Sincronizar
            </button>
          </div>
        </div>

        {/* Filtros */}
        <div style={{ backgroundColor: '#121214', padding: '20px', borderRadius: '12px', marginBottom: '35px', border: '1px solid #27272a', width: '100%', boxSizing: 'border-box' }}>
          <h2 style={{ fontSize: '1.05rem', margin: '0 0 15px 0', color: '#f4f4f5', display: 'flex', alignItems: 'center', gap: '8px' }}>
            📍 1. Filtrar por Turno / Envío
          </h2>
          
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <button onClick={() => setFiltro('todos')} 
              style={{ flex: 1, minWidth: '130px', padding: '10px 15px', borderRadius: '8px', border: '1px solid #27272a', fontWeight: 'bold', fontSize: '0.9rem', backgroundColor: filtro === 'todos' ? '#4f46e5' : '#18181b', color: 'white', cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '6px' }}>
              📋 Todos ({pedidos.length})
            </button>
            <button onClick={() => setFiltro('full')} 
              style={{ flex: 1, minWidth: '130px', padding: '10px 15px', borderRadius: '8px', border: '1px solid #27272a', fontWeight: 'bold', fontSize: '0.9rem', backgroundColor: filtro === 'full' ? '#4f46e5' : '#18181b', color: 'white', cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '6px' }}>
              🚀 Envío Full ({pedidos.filter(p => p.estado?.includes('Full')).length})
            </button>
            <button onClick={() => setFiltro('manana')} 
              style={{ flex: 1, minWidth: '130px', padding: '10px 15px', borderRadius: '8px', border: '1px solid #27272a', fontWeight: 'bold', fontSize: '0.9rem', backgroundColor: filtro === 'manana' ? '#4f46e5' : '#18181b', color: 'white', cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '6px' }}>
              ☀️ Mañana ({pedidos.filter(p => p.estado?.includes('Mañana')).length})
            </button>
            <button onClick={() => setFiltro('tarde')} 
              style={{ flex: 1, minWidth: '130px', padding: '10px 15px', borderRadius: '8px', border: '1px solid #27272a', fontWeight: 'bold', fontSize: '0.9rem', backgroundColor: filtro === 'tarde' ? '#4f46e5' : '#18181b', color: 'white', cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '6px' }}>
              🌙 Tarde ({pedidos.filter(p => p.estado?.includes('Tarde')).length})
            </button>
          </div>
        </div>
        
        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px', color: '#a1a1aa', fontSize: '1.1rem', fontWeight: '500' }}>
            Cargando ventas del depósito...
          </div>
        ) : (
          <div style={{ width: '100%' }}>
            {renderSeccionPedidos(pedidosPendientes, '⏳ Cola de Espera (Pendientes)', 'Pedidos ingresados esperando que un empleado los busque en las estanterías.')}
            {renderSeccionPedidos(pedidosEnProceso, '⚙️ En Armado / Listos', 'Pedidos que ya pasaron a preparación y están en curso.')}
            {renderSeccionPedidos(pedidosEnReparto, '🛵 En Reparto (En Camino)', 'Pedidos que ya salieron con el repartidor hacia el domicilio.')}
            {renderSeccionPedidos(pedidosFinalizados, '📦 Historial Terminado', 'Pedidos ya entregados al cliente o cancelados.')}
          </div>
        )}

      </div>

      {/* --- NUEVO: Barra flotante de acciones masivas --- */}
      {pedidosSeleccionados.length > 0 && (
        <div style={{
          position: 'fixed',
          bottom: '20px',
          backgroundColor: '#18181b',
          border: '1px solid #3f3f46',
          padding: '15px 25px',
          borderRadius: '12px',
          boxShadow: '0 10px 25px rgba(0,0,0,0.6)',
          display: 'flex',
          alignItems: 'center',
          gap: '20px',
          zIndex: 1100,
          flexWrap: 'wrap',
          maxWidth: '90%'
        }}>
          <span style={{ fontWeight: 'bold', fontSize: '0.95rem', color: '#f4f4f5' }}>
            📦 {pedidosSeleccionados.length} seleccionados
          </span>

          <select
            value={estadoMasivo}
            onChange={(e) => setEstadoMasivo(e.target.value)}
            style={{
              padding: '0.5rem 0.75rem',
              borderRadius: '8px',
              border: '1px solid #3f3f46',
              backgroundColor: '#09090b',
              color: '#f4f4f5',
              fontSize: '0.9rem',
              fontWeight: '500',
              outline: 'none'
            }}
          >
            <option value="Pendiente">Pendiente</option>
            <option value="En Preparación">⚙️ En Preparación</option>
            <option value="En Reparto">🛵 En Reparto</option>
            <option value="Entregado">Entregado</option>
            <option value="Cancelado">Cancelado</option>
          </select>

          <button
            onClick={cambiarEstadoMasivo}
            style={{
              backgroundColor: '#4f46e5',
              color: '#fff',
              border: 'none',
              padding: '8px 16px',
              borderRadius: '8px',
              fontWeight: 'bold',
              cursor: 'pointer',
              fontSize: '0.9rem'
            }}
          >
            Aplicar Estado Masivo
          </button>

          <button
            onClick={() => setPedidosSeleccionados([])}
            style={{
              backgroundColor: 'transparent',
              color: '#a1a1aa',
              border: 'none',
              cursor: 'pointer',
              fontSize: '0.9rem',
              fontWeight: 'bold'
            }}
          >
            Limpiar selección
          </button>
        </div>
      )}

      <style dangerouslySetInnerHTML={{__html: `
        @keyframes slideIn {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
      `}} />
    </main>
  );
}