'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation'; 
import { logAuditoria } from '@/lib/auditoria';

export default function DetallePedido() {
  const { id } = useParams(); 
  const router = useRouter();
  const [autorizado, setAutorizado] = useState(false);
  
  const [pedido, setPedido] = useState<any>(null);
  const [detalles, setDetalles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Memoria para guardar qué productos ya se agarraron de la estantería
  const [productosMarcados, setProductosMarcados] = useState<Record<string, boolean>>({});
  
  // Estado para evitar que se duplique el registro de auditoría mientras esté tildado
  const [completadoRegistrado, setCompletadoRegistrado] = useState(false);

  // 1. Efecto de Seguridad
  useEffect(() => {
    const rol = localStorage.getItem('rolUsuario');
    if (!rol) {
      router.push('/'); 
    } else {
      setAutorizado(true); 
    }
  }, [router]);

  // 2. Efecto de Carga de Datos
  useEffect(() => {
    async function fetchDetalleCompleto() {
      const { data: dataPedido, error: errorPedido } = await supabase
        .from('pedidos')
        .select('*')
        .eq('id_pedido', id)
        .single();

      if (dataPedido) setPedido(dataPedido);

      const { data: dataDetalles, error: errorDetalles } = await supabase
        .from('detalle_pedidos')
        .select(`
          cantidad, 
          precio_congelado, 
          id_producto,
          productos (nombre)
        `)
        .eq('id_pedido', id);

      if (dataDetalles) setDetalles(dataDetalles);
      
      setLoading(false);
    }

    if (id && autorizado) fetchDetalleCompleto();
  }, [id, autorizado]);

  // Verificamos si todos los productos del pedido ya fueron marcados
  const todosListos = detalles.length > 0 && detalles.every(item => productosMarcados[item.id_producto]);

  // 3. Efecto para registrar la auditoría cuando se completan todos los productos
  useEffect(() => {
    if (todosListos && !completadoRegistrado && id) {
      logAuditoria(
        'Pedidos', 
        'Pedido Completado', 
        `Terminó de armar y verificar todos los productos del pedido #${String(id).slice(0, 8)}`
      );
      setCompletadoRegistrado(true);
    } else if (!todosListos && completadoRegistrado) {
      // Si destildan alguno, reseteamos la bandera por si vuelven a completar
      setCompletadoRegistrado(false);
    }
  }, [todosListos, completadoRegistrado, id]);

  // Función para tildar o destildar un producto al armar el pedido
  const toggleMarca = (idProducto: string, nombreProducto: string) => {
    const nuevoEstado = !productosMarcados[idProducto];
    
    setProductosMarcados((prev) => ({
      ...prev,
      [idProducto]: nuevoEstado
    }));

    // Auditoría individual de cada producto marcado/destildado
    const accionTexto = nuevoEstado ? 'Marcó producto como listo' : 'Destildó producto';
    logAuditoria(
      'Pedidos', 
      accionTexto, 
      `Producto: "${nombreProducto}" en pedido #${String(id).slice(0, 8)}`
    );
  };

  if (!autorizado) {
    return (
      <main style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', backgroundColor: '#f3f4f6' }}>
        <p style={{ fontSize: '1.2rem', color: '#6b7280', fontWeight: 'bold' }}>Verificando accesos...</p>
      </main>
    );
  }

  if (loading) return <p className="texto-cargando">Cargando detalles del pedido...</p>;
  if (!pedido) return <p className="texto-cargando">No se encontró el pedido.</p>;

  const obtenerBadgeEnvio = (estado: string) => {
    if (estado?.includes('Full')) {
      return { texto: '🚀 ENVÍO FULL', fondo: '#f3e8ff', color: '#7e22ce', borde: '#d8b4fe' };
    } else if (estado?.includes('Mañana')) {
      return { texto: '☀️ TURNO MAÑANA', fondo: '#fef9c3', color: '#854d0e', borde: '#fde047' };
    } else if (estado?.includes('Tarde')) {
      return { texto: '🌙 TURNO TARDE', fondo: '#e0f2fe', color: '#0369a1', borde: '#7dd3fc' };
    }
    return { texto: '📦 ESTÁNDAR', fondo: '#f3f4f6', color: '#374151', borde: '#e5e7eb' };
  };

  const badge = obtenerBadgeEnvio(pedido.estado);

  return (
    <main className="contenedor-pagina" style={{ maxWidth: '800px', margin: '0 auto', padding: '20px' }}>
      <Link href="/pedidos" className="link-volver" style={{ display: 'inline-block', marginBottom: '20px', color: '#2563eb', textDecoration: 'none' }}>
        🔙 Volver a todos los pedidos
      </Link>

      <div className="encabezado-pagina" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h1 className="titulo-pagina" style={{ fontSize: '1.8rem' }}>Pedido #{String(pedido.id_pedido).slice(0, 8)}</h1>
        
        <span style={{ 
          backgroundColor: badge.fondo, 
          color: badge.color, 
          border: `1px solid ${badge.borde}`, 
          padding: '6px 12px', 
          borderRadius: '20px', 
          fontWeight: 'bold',
          fontSize: '0.9rem' 
        }}>
          {badge.texto}
        </span>
      </div>

      <div style={{ marginBottom: '20px', background: '#0c0c0d', padding: '15px', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
        <p style={{ margin: '5px 0' }}><strong>Teléfono del cliente:</strong> +{pedido.whatsapp_id}</p>
        <p style={{ margin: '5px 0' }}><strong>Dirección de entrega:</strong> {pedido.direccion || 'No especificada'}</p>
        <p style={{ margin: '5px 0' }}><strong>Estado actual:</strong> {pedido.estado}</p>
        <p style={{ margin: '5px 0' }}><strong>Total abonado:</strong> ${pedido.total_compra}</p>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '10px' }}>
        <h2>Lista de Armado (Picking):</h2>
        {todosListos && (
          <span style={{ color: '#16a34a', fontWeight: 'bold', backgroundColor: '#dcfce7', padding: '4px 10px', borderRadius: '15px', fontSize: '0.9rem' }}>
            ✅ ¡Pedido completo y listo para cerrar!
          </span>
        )}
      </div>

      <div className="contenedor-tabla" style={{ marginTop: '10px' }}>
        <table className="tabla-datos" style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid #e5e7eb' }}>
              <th className="texto-centro" style={{ textAlign: 'center', padding: '10px', width: '60px' }}>Listo</th>
              <th className="texto-izq" style={{ textAlign: 'left', padding: '10px' }}>Producto</th>
              <th className="texto-centro" style={{ textAlign: 'center', padding: '10px' }}>Cantidad</th>
              <th className="texto-centro" style={{ textAlign: 'center', padding: '10px' }}>Precio</th>
            </tr>
          </thead>
          <tbody>
            {detalles.map((item, index) => {
              const estaMarcado = productosMarcados[item.id_producto];
              const nombreProd = item.productos?.nombre || 'Producto desconocido';

              return (
                <tr 
                  key={index} 
                  style={{ 
                    borderBottom: '1px solid #f3f4f6',
                    backgroundColor: estaMarcado ? '#f3f4f6' : '#fff',
                    opacity: estaMarcado ? 0.6 : 1,
                    transition: 'all 0.2s ease-in-out'
                  }}
                >
                  <td className="texto-centro" style={{ textAlign: 'center', padding: '10px' }}>
                    <input 
                      type="checkbox" 
                      checked={estaMarcado || false}
                      onChange={() => toggleMarca(item.id_producto, nombreProd)}
                      style={{ width: '22px', height: '22px', cursor: 'pointer' }}
                    />
                  </td>
                  <td className="font-fuerte" style={{ padding: '10px', textDecoration: estaMarcado ? 'line-through' : 'none', color: '#000' }}>
                    {nombreProd}
                  </td>
                  <td className="texto-centro" style={{ textAlign: 'center', padding: '10px', textDecoration: estaMarcado ? 'line-through' : 'none', color: '#000' }}>
                    <strong style={{ fontSize: '1.1rem' }}>{item.cantidad}</strong>
                  </td>
                  <td className="texto-centro" style={{ textAlign: 'center', padding: '10px', textDecoration: estaMarcado ? 'line-through' : 'none', color: '#000' }}>
                    ${item.precio_congelado}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </main>
  );
}