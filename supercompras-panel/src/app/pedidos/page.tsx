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

  // ACÁ ESTÁ EL CAMBIO: Rescatamos el turno para que no se borre
  const cambiarEstado = async (id: any, nuevoEstadoElegido: string, estadoAnterior: string) => {
    let estadoFinal = nuevoEstadoElegido;

    // Si pasamos a "En Proceso" o "Entregado", le volvemos a pegar el turno que tenía
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

  // FUNCIÓN PARA GENERAR RUTA EN GOOGLE MAPS (Tres Lomas, Buenos Aires)
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

  // PASO 1: Aplicamos el primer filtro por Turno
  const pedidosPorTurno = pedidos.filter((pedido) => {
    if (filtro === 'todos') return true;
    if (filtro === 'full') return pedido.estado?.includes('Full');
    if (filtro === 'manana') return pedido.estado?.includes('Mañana');
    if (filtro === 'tarde') return pedido.estado?.includes('Tarde');
    return true;
  });

  // PASO 2: ACÁ ESTÁ EL OTRO CAMBIO (Usamos .includes para que detecte "En Proceso - Mañana", etc)
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

  // Componente interno para renderizar cada tabla manteniendo los estilos originales
  const renderTablaPedidos = (lista: any[], tituloSecc: string, colorEncabezado: string) => {
    if (lista.length === 0) {
      return (
        <div style={{ marginBottom: '30px' }}>
          <h2 style={{ fontSize: '1.3rem', marginBottom: '10px', color: colorEncabezado }}>{tituloSecc} (0)</h2>
          <p style={{ padding: '1rem', textAlign: 'center', background: '#f9fafb', borderRadius: '8px', color: '#6b7280' }}>No hay pedidos en esta sección para el turno seleccionado.</p>
        </div>
      );
    }

    return (
      <div style={{ marginBottom: '35px' }}>
        <h2 style={{ fontSize: '1.3rem', marginBottom: '10px', color: colorEncabezado }}>{tituloSecc} ({lista.length})</h2>
        <div className="contenedor-tabla">
          <table className="tabla-datos" style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #e5e7eb' }}>
                <th className="texto-izq" style={{ textAlign: 'left', padding: '12px' }}>Nº Pedido</th>
                <th className="texto-centro" style={{ textAlign: 'center', padding: '12px' }}>Total</th>
                <th className="texto-centro" style={{ textAlign: 'center', padding: '12px' }}>Estado y Logística</th>
                <th className="texto-centro" style={{ textAlign: 'center', padding: '12px' }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {lista.map((pedido) => {
                const estadoActual = pedido.estado || 'Pendiente';

                // Adaptamos el valor del select para que visualmente encaje con las opciones
                let valorSelect = estadoActual;
                if (estadoActual.includes('En Proceso')) valorSelect = 'En Proceso';
                if (estadoActual.includes('Entregado')) valorSelect = 'Entregado';
                if (estadoActual.includes('Cancelado')) valorSelect = 'Cancelado';

                return (
                  <tr key={pedido.id_pedido} style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td className="font-fuerte" style={{ padding: '12px' }}>
                      #{String(pedido.id_pedido).slice(0, 8)}...
                    </td>
                    
                    <td className="texto-centro font-fuerte" style={{ textAlign: 'center', padding: '12px' }}>
                      ${pedido.total_compra || 0}
                    </td>
                    
                    <td className="texto-centro" style={{ textAlign: 'center', padding: '12px' }}>
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

                    <td className="texto-centro" style={{ textAlign: 'center', padding: '12px' }}>
                      <Link 
                        href={`/pedidos/${pedido.id_pedido}`} 
                        style={{ padding: '0.4rem 0.8rem', backgroundColor: '#2563eb', color: '#fff', borderRadius: '4px', textDecoration: 'none', fontSize: '0.9rem', fontWeight: 'bold' }}
                      >
                        👁️ Ver Detalle
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
    <main className="contenedor-pagina" style={{ maxWidth: '1000px', margin: '0 auto', padding: '20px' }}>
      
      {rolActivo === 'admin' ? (
        <Link href="/dashboard" className="link-volver" style={{ display: 'inline-block', marginBottom: '15px', color: '#2563eb', textDecoration: 'none' }}>
          🔙 Volver al panel principal
        </Link>
      ) : (
        <button onClick={cerrarSesion} className="link-volver" style={{ display: 'inline-block', marginBottom: '15px', color: '#dc2626', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: '1rem', fontWeight: 'bold' }}>
          🔒 Cerrar Sesión
        </button>
      )}

      <div className="encabezado-pagina" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '10px' }}>
        <h1 className="titulo-pagina" style={{ fontSize: '1.8rem' }}>🛒 Gestión de Pedidos por Turno y Estado</h1>
        
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
          {/* BOTÓN PARA GENERAR LA RUTA DEL TURNO SELECCIONADO */}
          <button 
            onClick={abrirRutaEnMapa}
            style={{ 
              backgroundColor: '#16a34a', 
              color: '#fff', 
              border: 'none', 
              padding: '0.5rem 1rem', 
              borderRadius: '8px', 
              fontWeight: 'bold', 
              cursor: 'pointer',
              fontSize: '0.9rem'
            }}
          >
            🗺️ Generar Ruta (Turno Actual)
          </button>

          <span style={{ fontSize: '0.9rem', color: '#6b7280', fontWeight: 'bold' }}>
            👤 Modo: {rolActivo === 'admin' ? 'Administrador' : 'Empleado'}
          </span>
          <button onClick={fetchPedidos} className="btn btn-secundario" style={{ padding: '0.5rem 1rem', cursor: 'pointer' }}>
            🔄 Actualizar
          </button>
        </div>
      </div>

      {/* PRIMER FILTRO: SELECCIÓN DE TURNO */}
      <div style={{ marginBottom: '25px', padding: '15px', background: '#f9fafb', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
        <p style={{ fontSize: '0.9rem', fontWeight: 'bold', marginBottom: '10px', color: '#374151' }}>1. Filtrar por Turno / Logística:</p>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <button 
            onClick={() => setFiltro('todos')}
            style={{ padding: '8px 16px', borderRadius: '20px', border: '1px solid #d1d5db', background: filtro === 'todos' ? '#2563eb' : '#fff', color: filtro === 'todos' ? '#fff' : '#374151', cursor: 'pointer', fontWeight: 'bold' }}
          >
            📋 Todos ({pedidos.length})
          </button>
          <button 
            onClick={() => setFiltro('full')}
            style={{ padding: '8px 16px', borderRadius: '20px', border: '1px solid #d8b4fe', background: filtro === 'full' ? '#7e22ce' : '#f3e8ff', color: filtro === 'full' ? '#fff' : '#7e22ce', cursor: 'pointer', fontWeight: 'bold' }}
          >
            🚀 Envío Full ({pedidos.filter(p => p.estado?.includes('Full')).length})
          </button>
          <button 
            onClick={() => setFiltro('manana')}
            style={{ padding: '8px 16px', borderRadius: '20px', border: '1px solid #fde047', background: filtro === 'manana' ? '#ca8a04' : '#fef9c3', color: filtro === 'manana' ? '#fff' : '#854d0e', cursor: 'pointer', fontWeight: 'bold' }}
          >
            ☀️ Turno Mañana ({pedidos.filter(p => p.estado?.includes('Mañana')).length})
          </button>
          <button 
            onClick={() => setFiltro('tarde')}
            style={{ padding: '8px 16px', borderRadius: '20px', border: '1px solid #7dd3fc', background: filtro === 'tarde' ? '#0284c7' : '#e0f2fe', color: filtro === 'tarde' ? '#fff' : '#0369a1', cursor: 'pointer', fontWeight: 'bold' }}
          >
            🌙 Turno Tarde ({pedidos.filter(p => p.estado?.includes('Tarde')).length})
          </button>
        </div>
      </div>
      
      {loading ? (
        <p className="texto-cargando">Cargando ventas...</p>
      ) : (
        <div>
          {/* SEGUNDO NIVEL: DIVISIÓN POR ESTADOS DEL PEDIDO */}
          {renderTablaPedidos(pedidosPendientes, '⏳ 2.1. Pedidos Pendientes y Turnos Asignados', '#ca8a04')}
          {renderTablaPedidos(pedidosEnProceso, '⚙️ 2.2. Pedidos en Proceso / Preparación', '#2563eb')}
          {renderTablaPedidos(pedidosFinalizados, '📦 2.3. Historial (Entregados y Cancelados)', '#16a34a')}
        </div>
      )}
    </main>
  );
}