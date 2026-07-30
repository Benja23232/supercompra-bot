'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import Link from 'next/link';

export default function Pedidos() {
  const [pedidos, setPedidos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Estado para controlar la solapa de filtrado actual ('todos', 'full', 'manana', 'tarde')
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
    fetchPedidos();
  }, []);

  const cambiarEstado = async (id: any, nuevoEstado: string) => {
    const { error } = await supabase
      .from('pedidos')
      .update({ estado: nuevoEstado })
      .eq('id_pedido', id);

    if (error) {
      alert('Error al actualizar. Revisá la política de UPDATE en Supabase.');
      console.error(error);
    } else {
      fetchPedidos(); 
    }
  };

  // Lógica para filtrar los pedidos según el botón que elija el comerciante
  const pedidosFiltrados = pedidos.filter((pedido) => {
    if (filtro === 'todos') return true;
    if (filtro === 'full') return pedido.estado?.includes('Full');
    if (filtro === 'manana') return pedido.estado?.includes('Mañana');
    if (filtro === 'tarde') return pedido.estado?.includes('Tarde');
    return true;
  });

  return (
    <main className="contenedor-pagina" style={{ maxWidth: '1000px', margin: '0 auto', padding: '20px' }}>
      
      <Link href="/" className="link-volver" style={{ display: 'inline-block', marginBottom: '15px', color: '#2563eb', textDecoration: 'none' }}>
        🔙 Volver al panel principal
      </Link>

      <div className="encabezado-pagina" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h1 className="titulo-pagina" style={{ fontSize: '1.8rem' }}>🛒 Gestión de Pedidos</h1>
        <button onClick={fetchPedidos} className="btn btn-secundario" style={{ padding: '0.5rem 1rem', cursor: 'pointer' }}>
          🔄 Actualizar
        </button>
      </div>

      {/* PESTAÑAS DE FILTRADO (Organización de recorridos) */}
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
      ​) : pedidosFiltrados.length === 0 ? (
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
              {pedidosFiltrados.map((pedido) => (
                <tr key={pedido.id_pedido} style={{ borderBottom: '1px solid #f3f4f6' }}>
                  <td className="font-fuerte" style={{ padding: '12px' }}>
                    #{String(pedido.id_pedido).slice(0, 8)}...
                  </td>
                  
                  <td className="texto-centro font-fuerte" style={{ textAlign: 'center', padding: '12px' }}>
                    ${pedido.total_compra || 0}
                  </td>
                  
                  <td className="texto-centro" style={{ textAlign: 'center', padding: '12px' }}>
                    <select
                      value={pedido.estado || 'Pendiente'}
                      onChange={(e) => cambiarEstado(pedido.id_pedido, e.target.value)}
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
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}