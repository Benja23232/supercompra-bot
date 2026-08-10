'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import dynamic from 'next/dynamic';

// Importamos el mapa apagando el renderizado del servidor (SSR)
const MapaEnVivo = dynamic(() => import('./Mapa'), { 
  ssr: false,
  loading: () => <div style={{ display: 'flex', height: '100%', justifyContent: 'center', alignItems: 'center' }}>Cargando motor de mapas...</div>
});

export default function RastreoPage() {
  const router = useRouter();
  const [autorizado, setAutorizado] = useState(false);
  const [repartidores, setRepartidores] = useState<any[]>([]);

  useEffect(() => {
    const rol = localStorage.getItem('rolUsuario');
    if (rol !== 'admin') {
      router.push('/');
    } else {
      setAutorizado(true);
      cargarUbicaciones();
    }

    // Suscribirse a los movimientos de los repartidores en TIEMPO REAL
    const suscripcionGPS = supabase
      .channel('gps-repartidores')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'ubicacion_repartidores' },
        (payload) => {
          console.log('¡El repartidor se movió!', payload);
          cargarUbicaciones(); // Volvemos a traer las coordenadas actualizadas
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(suscripcionGPS);
    };
  }, [router]);

  const cargarUbicaciones = async () => {
    // Solo traemos repartidores que hayan actualizado su GPS en las últimas 12 horas para no mostrar datos viejos
    const haceDoceHoras = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString();
    
    const { data, error } = await supabase
      .from('ubicacion_repartidores')
      .select('*')
      .gte('actualizado_en', haceDoceHoras);

    if (data) setRepartidores(data);
  };

  if (!autorizado) return <div style={{ padding: '20px', textAlign: 'center', backgroundColor: '#f1f5f9', minHeight: '100vh' }}>Verificando accesos...</div>;

  return (
    <main style={{ padding: '20px', backgroundColor: '#f1f5f9', minHeight: '100vh', fontFamily: 'sans-serif' }}>
      <div style={{ marginBottom: '20px' }}>
        <Link href="/dashboard" style={{ color: '#2563eb', textDecoration: 'none', fontWeight: 'bold' }}>
          ← Volver al Panel Principal
        </Link>
      </div>

      <div style={{ backgroundColor: 'white', padding: '20px', borderRadius: '10px', boxShadow: '0 4px 6px rgba(0,0,0,0.05)', marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
        <div>
          <h1 style={{ margin: '0 0 5px 0', fontSize: '1.5rem', color: '#1e293b' }}>📍 Rastreo de Repartidores en Vivo</h1>
          <p style={{ margin: 0, color: '#64748b' }}>Monitoreo satelital de los envíos en curso. El mapa se actualiza automáticamente.</p>
        </div>
        <div style={{ backgroundColor: '#ecfdf5', color: '#10b981', padding: '8px 15px', borderRadius: '20px', fontWeight: 'bold', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '5px' }}>
          <span style={{ 
            display: 'inline-block', width: '10px', height: '10px', backgroundColor: '#10b981', borderRadius: '50%', animation: 'pulse 2s infinite' 
          }}></span>
          Conectado
        </div>
      </div>

      <div style={{ height: '70vh', backgroundColor: '#e2e8f0', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 4px 10px rgba(0,0,0,0.1)', border: '1px solid #cbd5e1' }}>
        <MapaEnVivo repartidores={repartidores} />
      </div>

      <style dangerouslySetInnerHTML={{__html: `
        @keyframes pulse {
          0% { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.7); }
          70% { box-shadow: 0 0 0 10px rgba(16, 185, 129, 0); }
          100% { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0); }
        }
      `}} />
    </main>
  );
}