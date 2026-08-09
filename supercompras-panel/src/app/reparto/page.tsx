'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';

export default function PantallaRepartidor() {
  const router = useRouter();
  const [autorizado, setAutorizado] = useState(false);
  
  const [pedidos, setPedidos] = useState<any[]>([]);
  const [cargando, setCargando] = useState(true);
  const [turnoActivo, setTurnoActivo] = useState('full');

  useEffect(() => {
    // 1. VERIFICAMOS LA SEGURIDAD
    const rol = localStorage.getItem('rolUsuario');
    
    if (!rol) {
      router.push('/'); // Si no está logueado, lo mandamos al inicio
    } else if (rol === 'repartidor' || rol === 'admin') {
      // Si es repartidor o admin, lo dejamos pasar y cargamos sus pedidos
      setAutorizado(true);
      cargarPedidosParaReparto();
    } else {
      // Si es un empleado normal de depósito, lo mandamos a pedidos
      router.push('/pedidos');
    }
  }, [router]);

  const cargarPedidosParaReparto = async () => {
    setCargando(true);
    const { data, error } = await supabase
      .from('pedidos')
      .select('*')
      .like('estado', '%En Proceso%')
      .order('fecha_creacion', { ascending: true });

    if (data) setPedidos(data);
    setCargando(false);
  };

  const notificarLlegada = async (pedido: any) => {
    alert(`Enviando WhatsApp a ${pedido.nombre_cliente || 'el cliente'} avisando que estás en camino...`);
  };

  const marcarEntregado = async (pedido: any) => {
    let estadoFinal = 'Entregado';
    if (pedido.estado.includes('Mañana')) estadoFinal = 'Entregado - Mañana';
    if (pedido.estado.includes('Tarde')) estadoFinal = 'Entregado - Tarde';
    if (pedido.estado.includes('Full')) estadoFinal = 'Entregado - Full';

    const { error } = await supabase
      .from('pedidos')
      .update({ estado: estadoFinal })
      .eq('id_pedido', pedido.id_pedido);

    if (!error) {
      cargarPedidosParaReparto();
    }
  };

  const abrirMapa = (direccion: string) => {
    if (!direccion) return;
    const limpia = direccion.trim();
    const dirFinal = limpia.toLowerCase().includes('tres lomas') ? limpia : `${limpia}, Tres Lomas, Buenos Aires`;
    window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(dirFinal)}`, '_blank');
  };

  const cerrarSesion = () => {
    localStorage.clear();
    router.push('/');
  };

  const pedidosFiltrados = pedidos.filter(p => {
    if (turnoActivo === 'full') return p.estado?.includes('Full');
    if (turnoActivo === 'manana') return p.estado?.includes('Mañana');
    if (turnoActivo === 'tarde') return p.estado?.includes('Tarde');
    return false;
  });

  // Si no está autorizado, mostramos pantalla de carga
  if (!autorizado) return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', backgroundColor: '#0f172a', color: 'white' }}>Verificando acceso...</div>;

  return (
    <main style={{ padding: '15px', backgroundColor: '#1e293b', minHeight: '100vh', fontFamily: 'sans-serif' }}>
      
      {/* Botón de Cerrar Sesión del Repartidor */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '10px' }}>
        <button 
          onClick={cerrarSesion} 
          style={{ background: 'none', border: 'none', color: '#ef4444', fontWeight: 'bold', fontSize: '0.9rem', cursor: 'pointer' }}
        >
          🔒 Salir
        </button>
      </div>

      <div style={{ backgroundColor: '#0f172a', color: 'white', padding: '15px', borderRadius: '10px', marginBottom: '20px', textAlign: 'center', border: '1px solid #334155' }}>
        <h1 style={{ margin: 0, fontSize: '1.4rem' }}>🛵 Mi Recorrido</h1>
        <p style={{ margin: '5px 0 0 0', color: '#94a3b8', fontSize: '0.9rem' }}>
          Seleccioná tu turno para ver las entregas
        </p>
      </div>

      <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
        <button onClick={() => setTurnoActivo('full')} style={{ flex: 1, padding: '10px', borderRadius: '8px', border: 'none', fontWeight: 'bold', backgroundColor: turnoActivo === 'full' ? '#3b82f6' : '#334155', color: 'white' }}>🚀 Full</button>
        <button onClick={() => setTurnoActivo('manana')} style={{ flex: 1, padding: '10px', borderRadius: '8px', border: 'none', fontWeight: 'bold', backgroundColor: turnoActivo === 'manana' ? '#f59e0b' : '#334155', color: 'white' }}>☀️ Mañana</button>
        <button onClick={() => setTurnoActivo('tarde')} style={{ flex: 1, padding: '10px', borderRadius: '8px', border: 'none', fontWeight: 'bold', backgroundColor: turnoActivo === 'tarde' ? '#8b5cf6' : '#334155', color: 'white' }}>🌙 Tarde</button>
      </div>

      <div style={{ marginBottom: '15px', color: '#cbd5e1', fontSize: '0.95rem', fontWeight: 'bold' }}>
        Tienes {pedidosFiltrados.length} pedidos en este turno
      </div>

      {cargando ? (
        <div style={{ textAlign: 'center', color: '#94a3b8', padding: '20px' }}>Cargando mapa...</div>
      ) : pedidosFiltrados.length === 0 ? (
        <div style={{ textAlign: 'center', color: '#64748b', marginTop: '50px', backgroundColor: '#0f172a', padding: '30px', borderRadius: '10px' }}>
          <span style={{ fontSize: '3rem' }}>🎉</span>
          <h2>¡Todo entregado!</h2>
          <p>No hay pedidos pendientes en este turno.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
          {pedidosFiltrados.map((pedido, index) => (
            <div key={pedido.id_pedido} style={{ backgroundColor: '#242526', padding: '15px', borderRadius: '12px', border: '1px solid #3a3b3c' }}>
              
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                <div style={{ width: '100%' }}>
                  <h3 style={{ margin: '0 0 8px 0', fontSize: '1rem', color: '#64748b', borderBottom: '1px solid #334155', paddingBottom: '5px' }}>
                    📦 Entrega #{index + 1}
                  </h3>
                  
                  {/* ACÁ RESALTAMOS AL CLIENTE */}
                  <p style={{ margin: '0 0 5px 0', color: '#f8fafc', fontSize: '1.15rem' }}>
                    👤 <strong>{pedido.nombre_cliente || 'Cliente de WhatsApp'}</strong>
                  </p>
                  
                  <p style={{ margin: 0, color: '#94a3b8', fontSize: '0.95rem' }}>
                    💰 Total a cobrar: <span style={{ color: '#10b981', fontWeight: 'bold', fontSize: '1.1rem' }}>${pedido.total_compra}</span>
                  </p>
                </div>
              </div>

              <div style={{ backgroundColor: '#1a1b1c', padding: '10px', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                <span style={{ color: '#e2e8f0', fontSize: '0.9rem', flex: 1 }}>
                  📍 {pedido.direccion || 'Sin dirección'}
                </span>
                {pedido.direccion && (
                  <button onClick={() => abrirMapa(pedido.direccion)} style={{ backgroundColor: '#16a34a', color: 'white', border: 'none', padding: '8px 12px', borderRadius: '6px', fontWeight: 'bold' }}>
                    🗺️ Mapa
                  </button>
                )}
              </div>

              <div style={{ display: 'flex', gap: '10px' }}>
                <button onClick={() => notificarLlegada(pedido)} style={{ flex: 1, backgroundColor: '#f59e0b', color: 'white', border: 'none', padding: '14px', borderRadius: '8px', fontWeight: 'bold', fontSize: '1rem', display: 'flex', justifyContent: 'center', gap: '5px' }}>
                  🔔 Avisar llegada
                </button>
                <button onClick={() => marcarEntregado(pedido)} style={{ flex: 1, backgroundColor: '#3b82f6', color: 'white', border: 'none', padding: '14px', borderRadius: '8px', fontWeight: 'bold', fontSize: '1rem', display: 'flex', justifyContent: 'center', gap: '5px' }}>
                  ✅ Entregado
                </button>
              </div>

            </div>
          ))}
        </div>
      )}
    </main>
  );
}