'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function Auditorias() {
  const router = useRouter();
  const [autorizado, setAutorizado] = useState(false);
  const [auditorias, setAuditorias] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  async function fetchAuditorias() {
    setLoading(true);
    const { data, error } = await supabase
      .from('auditorias')
      .select('*')
      .order('fecha', { ascending: false }); // Del más reciente al más antiguo

    if (error) {
      console.error("Error al traer auditorías:", error);
    } else {
      setAuditorias(data || []);
    }
    setLoading(false);
  }

  useEffect(() => {
    // Seguridad: Patovica exclusivo para Admin
    const rol = localStorage.getItem('rolUsuario');
    if (!rol) {
      router.push('/');
    } else if (rol !== 'admin') {
      router.push('/pedidos');
    } else {
      setAutorizado(true);
      fetchAuditorias();
    }
  }, [router]);

  if (!autorizado) {
    return (
      <main style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', backgroundColor: '#f3f4f6' }}>
        <p style={{ fontSize: '1.2rem', color: '#6b7280', fontWeight: 'bold' }}>Verificando accesos de administrador...</p>
      </main>
    );
  }

  return (
    <main className="contenedor-pagina" style={{ maxWidth: '1100px', margin: '0 auto', padding: '20px' }}>
      
      <Link href="/dashboard" className="link-volver" style={{ display: 'inline-block', marginBottom: '20px', color: '#2563eb', textDecoration: 'none' }}>
        🔙 Volver al panel principal
      </Link>

      <div className="encabezado-pagina" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <div>
          <h1 className="titulo-pagina" style={{ fontSize: '1.8rem', marginBottom: '5px' }}>🛡️ Registro de Auditorías</h1>
          <p style={{ color: '#6b7280', fontSize: '0.95rem' }}>Historial detallado de acciones realizadas por los usuarios en el sistema.</p>
        </div>
        <button onClick={fetchAuditorias} className="btn btn-secundario" style={{ padding: '0.5rem 1rem', cursor: 'pointer' }}>
          🔄 Actualizar
        </button>
      </div>

      {loading ? (
        <p className="texto-cargando">Cargando registros de actividad...</p>
      ) : auditorias.length === 0 ? (
        <p className="texto-cargando" style={{ padding: '2rem', textAlign: 'center', background: '#f9fafb', borderRadius: '8px' }}>
          No hay registros de auditoría todavía.
        </p>
      ) : (
        <div className="contenedor-tabla">
          <table className="tabla-datos" style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #e5e7eb', textAlign: 'left' }}>
                <th style={{ padding: '12px' }}>Fecha y Hora</th>
                <th style={{ padding: '12px' }}>Usuario</th>
                <th style={{ padding: '12px' }}>Módulo</th>
                <th style={{ padding: '12px' }}>Acción</th>
                <th style={{ padding: '12px' }}>Detalles</th>
              </tr>
            </thead>
            <tbody>
              {auditorias.map((item) => (
                <tr key={item.id_auditoria} style={{ borderBottom: '1px solid #f3f4f6' }}>
                  
                  <td style={{ padding: '12px', fontSize: '0.85rem', color: '#4b5563', whiteSpace: 'nowrap' }}>
                    {/* Corrección para evitar la doble resta del huso horario */}
                    {new Date(item.fecha.substring(0, 19) + '-03:00').toLocaleString('es-AR', {
                      timeZone: 'America/Argentina/Buenos_Aires',
                      day: '2-digit',
                      month: '2-digit',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit',
                      hour12: false
                    })}
                  </td>

                  <td style={{ padding: '12px', fontWeight: 'bold', fontSize: '0.9rem' }}>
                    {item.email_usuario}
                  </td>

                  <td style={{ padding: '12px' }}>
                    <span style={{ backgroundColor: '#e0f2fe', color: '#0369a1', padding: '4px 8px', borderRadius: '4px', fontSize: '0.8rem', fontWeight: 'bold' }}>
                      {item.modulo}
                    </span>
                  </td>

                  <td style={{ padding: '12px', fontWeight: '500' }}>
                    {item.accion}
                  </td>

                  <td style={{ padding: '12px', color: '#6b7280', fontSize: '0.9rem' }}>
                    {item.detalles || '-'}
                  </td>

                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}