'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';

export default function PantallaRepartidor() {
  const router = useRouter();
  const [autorizado, setAutorizado] = useState(false);
  const [emailRepartidor, setEmailRepartidor] = useState('');
  
  const [pedidos, setPedidos] = useState<any[]>([]);
  const [cargando, setCargando] = useState(true);
  const [turnoActivo, setTurnoActivo] = useState('full');
  
  const [gpsActivo, setGpsActivo] = useState(false);

  useEffect(() => {
    const rol = localStorage.getItem('rolUsuario');
    const email = localStorage.getItem('emailUsuario') || '';
    
    if (!rol) {
      router.push('/');
    } else if (rol === 'repartidor' || rol === 'admin') {
      setAutorizado(true);
      setEmailRepartidor(email);
      cargarPedidosParaReparto();
    } else {
      router.push('/pedidos');
    }
  }, [router]);

  useEffect(() => {
    let watchId: number;

    if (autorizado && emailRepartidor && 'geolocation' in navigator) {
      watchId = navigator.geolocation.watchPosition(
        async (posicion) => {
          const { latitude, longitude } = posicion.coords;
          
          await supabase.from('ubicacion_repartidores').upsert({
            email: emailRepartidor,
            latitud: latitude,
            longitud: longitude,
            actualizado_en: new Date().toISOString()
          });
          
          setGpsActivo(true);
        },
        (error) => {
          console.error("Error obteniendo GPS:", error);
          setGpsActivo(false);
        },
        { 
          enableHighAccuracy: true, 
          maximumAge: 10000, 
          timeout: 5000 
        }
      );
    }

    return () => {
      if (watchId) navigator.geolocation.clearWatch(watchId);
    };
  }, [autorizado, emailRepartidor]);

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

  // --- FUNCIÓN CORREGIDA ---
  const notificarLlegada = async (pedido: any) => {
    const tel = pedido.whatsapp_id;
    if (tel) {
      const numeroLimpio = tel.toString().replace(/[^0-9]/g, '');
      const mensaje = encodeURIComponent(`Hola ${pedido.nombre_cliente || 'cliente'}, te escribo de logística porque estoy en camino con tu pedido.`);
      window.open(`https://wa.me/${numeroLimpio}?text=${mensaje}`, '_blank');
    } else {
      alert(`No se encontró un número de teléfono cargado.`);
    }
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

    if (!error) cargarPedidosParaReparto();
  };

  const abrirMapaIndividual = (direccion: string) => {
    if (!direccion) return;
    const limpia = direccion.trim();
    const dirFinal = limpia.toLowerCase().includes('tres lomas') ? limpia : `${limpia}, Tres Lomas, Buenos Aires`;
    window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(dirFinal)}`, '_blank');
  };

  const abrirRutaCompletaEnMapa = () => {
    const pedidosActivos = pedidosFiltrados.filter(p => p.direccion && p.direccion.trim() !== '');
    if (pedidosActivos.length === 0) return alert("No hay direcciones cargadas en este turno.");

    const formatearDir = (dir: string) => {
      const limpia = dir.trim();
      return limpia.toLowerCase().includes('tres lomas') ? limpia : `${limpia}, Tres Lomas, Buenos Aires`;
    };

    const origen = encodeURIComponent(formatearDir(pedidosActivos[0].direccion));
    const destinoFinal = encodeURIComponent(formatearDir(pedidosActivos[pedidosActivos.length - 1].direccion));
    const waypoints = pedidosActivos.slice(1, -1).map(p => encodeURIComponent(formatearDir(p.direccion))).join('|');

    let urlMaps = `https://www.google.com/maps/dir/?api=1&origin=${origen}&destination=${destinoFinal}`;
    if (waypoints.length > 0) urlMaps += `&waypoints=${waypoints}`;
    window.open(urlMaps, '_blank');
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

  if (!autorizado) return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', backgroundColor: '#f3f4f6', color: '#64748b', fontWeight: 'bold' }}>Verificando acceso...</div>;

  return (
    <main className="panel-principal" style={{ padding: '15px', minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      
      <div style={{ width: '100%', maxWidth: '600px' }}>
        
        {/* TOP BAR: GPS y Salir */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <div style={{ 
            backgroundColor: gpsActivo ? '#dcfce7' : '#fee2e2', 
            color: gpsActivo ? '#166534' : '#991b1b', 
            padding: '6px 12px', 
            borderRadius: '20px', 
            fontSize: '0.85rem', 
            fontWeight: 'bold', 
            display: 'flex', 
            alignItems: 'center', 
            gap: '5px',
            border: `1px solid ${gpsActivo ? '#bbf7d0' : '#fecaca'}`
          }}>
            {gpsActivo ? '📡 GPS Activo' : '❌ GPS Apagado'}
          </div>
          <button onClick={cerrarSesion} style={{ background: 'none', border: 'none', color: '#dc2626', fontWeight: 'bold', fontSize: '0.95rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px' }}>
            🔒 Salir
          </button>
        </div>

        {/* CABECERA */}
        <div className="cabecera" style={{ textAlign: 'center', marginBottom: '25px' }}>
          <h1 className="titulo" style={{ fontSize: '1.8rem', marginBottom: '5px' }}>Mi Recorrido</h1>
          <p className="subtitulo" style={{ fontSize: '0.95rem', margin: 0 }}>Seleccioná tu turno</p>
        </div>

        {/* TABS DE TURNOS */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '25px' }}>
          <button onClick={() => setTurnoActivo('full')} style={{ flex: 1, padding: '12px 5px', borderRadius: '8px', border: turnoActivo === 'full' ? 'none' : '1px solid #cbd5e1', fontWeight: 'bold', fontSize: '0.95rem', backgroundColor: turnoActivo === 'full' ? '#2563eb' : '#ffffff', color: turnoActivo === 'full' ? '#ffffff' : '#475569' }}>🚀 Full</button>
          <button onClick={() => setTurnoActivo('manana')} style={{ flex: 1, padding: '12px 5px', borderRadius: '8px', border: turnoActivo === 'manana' ? 'none' : '1px solid #cbd5e1', fontWeight: 'bold', fontSize: '0.95rem', backgroundColor: turnoActivo === 'manana' ? '#f59e0b' : '#ffffff', color: turnoActivo === 'manana' ? '#ffffff' : '#475569' }}>☀️ Mañana</button>
          <button onClick={() => setTurnoActivo('tarde')} style={{ flex: 1, padding: '12px 5px', borderRadius: '8px', border: turnoActivo === 'tarde' ? 'none' : '1px solid #cbd5e1', fontWeight: 'bold', fontSize: '0.95rem', backgroundColor: turnoActivo === 'tarde' ? '#8b5cf6' : '#ffffff', color: turnoActivo === 'tarde' ? '#ffffff' : '#475569' }}>🌙 Tarde</button>
        </div>

        {/* BOTÓN INICIAR RUTA GPS */}
        {pedidosFiltrados.length > 0 && (
          <button onClick={abrirRutaCompletaEnMapa} style={{ width: '100%', padding: '15px', backgroundColor: '#10b981', color: 'white', border: 'none', borderRadius: '10px', fontWeight: 'bold', fontSize: '1.1rem', marginBottom: '25px', cursor: 'pointer' }}>
            🗺️ INICIAR RUTA EN GPS ({pedidosFiltrados.length})
          </button>
        )}

        {/* LISTA DE PEDIDOS */}
        {cargando ? (
          <div style={{ textAlign: 'center', color: '#64748b', padding: '20px', fontWeight: '500' }}>Cargando ruta...</div>
        ) : pedidosFiltrados.length === 0 ? (
          <div style={{ color: 'black', textAlign: 'center', backgroundColor: '#ffffff', padding: '40px 20px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>🎉 ¡Todo entregado!</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
            {pedidosFiltrados.map((pedido, index) => (
              <div key={pedido.id_pedido} style={{ backgroundColor: '#ffffff', padding: '20px', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px rgba(0,0,0,0.05)' }}>
                <h3 style={{ margin: '0 0 10px 0', fontSize: '1.05rem', color: '#64748b', borderBottom: '1px solid #f1f5f9', paddingBottom: '8px', display: 'flex', justifyContent: 'space-between' }}>
                  <span>📦 Entrega #{index + 1}</span>
                  <span style={{ fontSize: '0.85rem' }}>ID: #{String(pedido.id_pedido).slice(0, 6)}</span>
                </h3>
                
                {/* --- RENDERIZADO CORREGIDO --- */}
                <div style={{ marginBottom: '12px' }}>
                  <p style={{ margin: '0 0 4px 0', color: '#1e293b', fontSize: '1.15rem', fontWeight: 'bold' }}>
                    👤 {pedido.nombre_cliente || 'Cliente sin nombre'}
                  </p>
                  <p style={{ margin: 0, color: '#475569', fontSize: '0.95rem' }}>
                    📞 {pedido.whatsapp_id ? `+${pedido.whatsapp_id}` : 'Sin teléfono cargado'}
                  </p>
                </div>

                <div style={{ backgroundColor: '#f8fafc', padding: '12px', borderRadius: '8px', marginBottom: '15px', border: '1px solid #e2e8f0' }}>
                  <p style={{ color:'black', margin: '0 0 5px 0', fontSize: '0.95rem' }}>📍 {pedido.direccion || 'Sin dirección'}</p>
                  {pedido.direccion && <button onClick={() => abrirMapaIndividual(pedido.direccion)} style={{ backgroundColor: '#e2e8f0', border: 'none', padding: '8px 12px', borderRadius: '6px', fontSize: '0.85rem', cursor: 'pointer' }}>Solo Mapa</button>}
                </div>

                <div style={{ display: 'flex', gap: '10px' }}>
                  <button onClick={() => notificarLlegada(pedido)} style={{ flex: 1, backgroundColor: '#f59e0b', color: 'white', border: 'none', padding: '12px', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer' }}>🔔 Avisar</button>
                  <button onClick={() => marcarEntregado(pedido)} style={{ flex: 1, backgroundColor: '#2563eb', color: 'white', border: 'none', padding: '12px', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer' }}>✅ Entregado</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}