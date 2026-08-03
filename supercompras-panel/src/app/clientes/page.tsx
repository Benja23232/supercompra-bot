'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function Clientes() {
  const [clientes, setClientes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const [autorizado, setAutorizado] = useState(false);

  async function fetchClientes() {
    setLoading(true);
    // Traemos los datos según tu esquema: whatsapp_id, nombre, fecha_registro
    const { data, error } = await supabase
      .from('clientes')
      .select('*')
      .order('nombre', { ascending: true });

    if (error) console.error("Error al traer clientes:", error);
    else setClientes(data || []);
    setLoading(false);
  }

  useEffect(() => {
    // 1. Buscamos la credencial en la memoria
    const rol = localStorage.getItem('rolUsuario');

    // 2. Tomamos decisiones de seguridad
    if (!rol) {
      router.push('/'); // No logueado -> Login
    } else if (rol !== 'admin') {
      router.push('/pedidos'); // Empleado -> Solo pedidos
    } else {
      setAutorizado(true); // Admin -> Permitido
      fetchClientes(); // Cargamos los datos recién ahora que sabemos que es admin
    }
  }, [router]);

  // Pantalla de espera mientras verifica
  if (!autorizado) {
    return (
      <main style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', backgroundColor: '#f3f4f6' }}>
        <p style={{ fontSize: '1.2rem', color: '#6b7280', fontWeight: 'bold' }}>Verificando accesos...</p>
      </main>
    );
  }

  return (
    <main className="contenedor-pagina">
      
      {/* Actualizado para volver al dashboard y no al login */}
      <Link href="/dashboard" className="link-volver">
        🔙 Volver al panel principal
      </Link>

      <div className="encabezado-pagina">
        <h1 className="titulo-pagina">👥 Gestión de Clientes</h1>
        <button onClick={fetchClientes} className="btn btn-secundario">
          🔄 Actualizar
        </button>
      </div>
      
      {loading ? (
        <p className="texto-cargando">Cargando base de datos...</p>
      ) : clientes.length === 0 ? (
        <p className="texto-cargando">Aún no hay clientes registrados.</p>
      ) : (
        <div className="contenedor-tabla">
          <table className="tabla-datos">
            <thead>
              <tr>
                <th className="texto-izq">Nombre</th>
                <th className="texto-centro">Numero</th>
                <th className="texto-centro">Fecha de Registro</th>
              </tr>
            </thead>
            <tbody>
              {clientes.map((cliente) => (
                <tr key={cliente.whatsapp_id}>
                  <td className="font-fuerte">{cliente.nombre}</td>
                  
                  <td className="texto-centro font-mono text-sm text-gray-400">
                    {cliente.whatsapp_id}
                  </td>
                  
                  <td className="texto-centro text-sm text-gray-400">
                    {new Date(cliente.fecha_registro).toLocaleDateString('es-AR')}
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