'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import Link from 'next/link';

export default function Pedidos() {
  const [pedidos, setPedidos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

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
    fetchPedidos();
  }, []);

  const cambiarEstado = async (id: string, nuevoEstado: string) => {
    const { error } = await supabase
      .from('pedidos')
      .update({ estado: nuevoEstado })
      .eq('id_pedido', id);

    if (error) {
      alert('Error al actualizar. Revisá la política de UPDATE en Supabase.');
      console.error(error);
    } else {
      fetchPedidos(); // Recargamos para ver el cambio
    }
  };

  return (
    <main className="contenedor-pagina">
      
      <Link href="/" className="link-volver">
        🔙 Volver al panel principal
      </Link>

      <div className="encabezado-pagina">
        <h1 className="titulo-pagina">🛒 Gestión de Pedidos</h1>
        <button onClick={fetchPedidos} className="btn btn-secundario">
          🔄 Actualizar
        </button>
      </div>
      
      {loading ? (
        <p className="texto-cargando">Cargando ventas...</p>
      ) : pedidos.length === 0 ? (
        <p className="texto-cargando">No hay pedidos registrados.</p>
      ) : (
        <div className="contenedor-tabla">
          <table className="tabla-datos">
            <thead>
              <tr>
                <th className="texto-izq">Nº Pedido</th>
                <th className="texto-centro">Total</th>
                <th className="texto-centro">Estado</th>
              </tr>
            </thead>
            <tbody>
              {pedidos.map((pedido) => (
                <tr key={pedido.id_pedido}>
                  <td className="font-fuerte">
                    #{String(pedido.id_pedido).slice(0, 8)}...
                  </td>
                  
                  <td className="texto-centro font-fuerte">
                    ${pedido.total_compra || 0}
                  </td>
                  
                  <td className="texto-centro">
                    <select
                      value={pedido.estado || 'Pendiente'}
                      onChange={(e) => cambiarEstado(pedido.id_pedido, e.target.value)}
                      className="input-tabla"
                      style={{ width: '140px', padding: '0.4rem', cursor: 'pointer' }}
                    >
                      <option value="Pendiente">Pendiente</option>
                      <option value="En Proceso">En Proceso</option>
                      <option value="Entregado">Entregado</option>
                      <option value="Cancelado">Cancelado</option>
                    </select>
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