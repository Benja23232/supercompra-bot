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
  
  // Estado para controlar la solapa de filtrado actual
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
    // 1. Buscamos la credencial en la memoria
    const rol = localStorage.getItem('rolUsuario');

    // 2. Tomamos decisiones de seguridad
    if (!rol) {
      router.push('/'); 
    } else {
      setRolActivo(rol); 
      setAutorizado(true); 
      fetchPedidos();
    }
  }, [router]);

  const cambiarEstado = async (id: any, nuevoEstado: string, estadoAnterior: string) => {
    if (nuevoEstado === estadoAnterior) return;

    const { error } = await supabase
      .from('pedidos')
      .update({ estado: nuevoEstado })
      .eq('id_pedido', id);

    if (error) {
      alert('Error al actualizar el estado.');
      console.error(error);
    } else {
      // Registramos la auditoría del cambio de estado
      await logAuditoria(
        'Pedidos',
        'Cambio de estado',
        `Actualizó el estado del pedido #${String(id).slice(0, 8)} de "${estadoAnterior}" a "${nuevoEstado}"`
      );

      fetchPedidos(); 
    }
  };

  const cerrarSesion = () => {
    localStorage.clear();
    router.push('/');
  };

  // FUNCIÓN PARA GENERAR RUTA EN GOOGLE MAPS (Ajustada para Tres Lomas, Buenos Aires)
  const abrirRutaEnMapa = () => {
    // Filtramos solo los pedidos que tienen dirección cargada
    const pedidosConDireccion = pedidosFiltrados.filter(p => p.direccion && p.direccion.trim() !== '');

    if (pedidosConDireccion.length === 0) {
      alert("No hay pedidos con dirección cargada en esta vista para armar la ruta.");
      return;
    }

    // Función auxiliar para asegurar que Google Maps ubique la dirección en Tres Lomas
    const formatearDir = (dir: string) => {
      const limpia = dir.trim();
      if (limpia.toLowerCase().includes('tres lomas')) return limpia;
      return `${limpia}, Tres Lomas, Buenos Aires`;
    };

    const origen = encodeURIComponent(formatearDir(pedidosConDireccion[0].direccion));
    const direccionDestino = pedidosConDireccion[pedidosConDireccion.length - 1].direccion;
    const destinoFinal = encodeURIComponent(formatearDir(direccionDestino));

    const puntosIntermedios = pedidosConDireccion.slice(1, -1);
    const waypoints = puntosIntermedios.map(p => encodeURIComponent(formatearDir(p.direccion))).join('|');

    let urlMaps = `https://www.google.com/maps/dir/?api=1&origin=${origen}&destination=${destinoFinal}`;
    
    if (waypoints.length > 0) {
      urlMaps += `&waypoints=${waypoints}`;
    }

    window.open(urlMaps, '_blank');
  };

  // Lógica para filtrar los pedidos
  const pedidosFiltrados = pedidos.filter((pedido) => {
    if (filtro === 'todos') return true;
    if (filtro === 'full') return pedido.estado?.includes('Full');
    if (filtro === 'manana') return pedido.estado?.includes('Mañana');
    if (filtro === 'tarde') return pedido.estado?.includes('Tarde');
    return true;
  });

  if (!autorizado) {
    return (
      <main style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', backgroundColor: '#f3f4f6' }}>
        <p style={{ fontSize: '1.2rem', color: '#6b7280', fontWeight: 'bold' }}>Verificando accesos...</p>
      </main>
    );
  }

  return (
    <main className="contenedor-pagina" style={{ maxWidth: '1000px', margin: '0 auto', padding: '20px' }}>
      
      {/* Botón superior dinámico según el rol */}
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
        <h1 className="titulo-pagina" style={{ fontSize: '1.8rem' }}>🛒 Gestión de Pedidos</h1>
        
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
          {/* BOTÓN PARA GENERAR LA RUTA DE REPARTO */}
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
            🗺️ Generar Ruta de Reparto
          </button>

          <span style={{ fontSize: '0.9rem', color: '#6b7280', fontWeight: 'bold' }}>
            👤 Modo: {rolActivo === 'admin' ? 'Administrador' : 'Empleado'}
          </span>
          <button onClick={fetchPedidos} className="btn btn-secundario" style={{ padding: '0.5rem 1rem', cursor: 'pointer' }}>
            🔄 Actualizar
          </button>
        </div>
      </div>

      {/* PESTAÑAS DE FILTRADO */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', flexWrap: 'wrap' }}>
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
      
      {loading ? (
        <p className="texto-cargando">Cargando ventas...</p>
      ) : pedidosFiltrados.length === 0 ? (
        <p className="texto-cargando" style={{ padding: '2rem', textAlign: 'center', background: '#f9fafb', borderRadius: '8px' }}>No hay pedidos en esta categoría.</p>
      ) : (
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
              {pedidosFiltrados.map((pedido) => {
                const estadoActual = pedido.estado || 'Pendiente';

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
                        value={estadoActual}
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
      )}
    </main>
  );
}