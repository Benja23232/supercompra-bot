'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import Link from 'next/link';

export default function Clientes() {
  const [clientes, setClientes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

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
    fetchClientes();
  }, []);

  return (
    <main className="contenedor-pagina">
      
      <Link href="/" className="link-volver">
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
                <th className="texto-centro">WhatsApp ID</th>
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