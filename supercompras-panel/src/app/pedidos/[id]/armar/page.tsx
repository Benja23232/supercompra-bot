'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation'; 
import { logAuditoria } from '@/lib/auditoria'; 

export default function ArmarPedido() {
  const { id } = useParams(); 
  const router = useRouter();
  const [autorizado, setAutorizado] = useState(false);
  
  const [pedido, setPedido] = useState<any>(null);
  const [detalles, setDetalles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [procesando, setProcesando] = useState(false);

  const [productosMarcados, setProductosMarcados] = useState<Record<string, boolean>>({});

  // --- ESTADOS PARA EDICIÓN EN VIVO ---
  const [editandoCliente, setEditandoCliente] = useState(false);
  const [editNombre, setEditNombre] = useState('');
  const [editTelefono, setEditTelefono] = useState('');
  const [editDireccion, setEditDireccion] = useState('');

  const [inventarioProductos, setInventarioProductos] = useState<any[]>([]);
  const [busqProdNuevo, setBusqProdNuevo] = useState('');
  const [agregandoProducto, setAgregandoProducto] = useState(false);

  useEffect(() => {
    const rol = localStorage.getItem('rolUsuario');
    if (!rol) {
      router.push('/'); 
    } else {
      setAutorizado(true); 
    }
  }, [router]);

  useEffect(() => {
    async function fetchDetalleYAutomatizar() {
      const { data: dataPedido } = await supabase
        .from('pedidos')
        .select('*')
        .eq('id_pedido', id)
        .single();

      if (dataPedido) {
        if (dataPedido.estado?.includes('Pendiente')) {
          let sufijoTurno = '';
          if (dataPedido.estado.includes('Mañana')) sufijoTurno = ' - Mañana';
          else if (dataPedido.estado.includes('Tarde')) sufijoTurno = ' - Tarde';
          else if (dataPedido.estado.includes('Full')) sufijoTurno = ' - Full';

          const nuevoEstadoAuto = `En Proceso${sufijoTurno}`;
          
          await supabase.from('pedidos').update({ estado: nuevoEstadoAuto }).eq('id_pedido', id);
          dataPedido.estado = nuevoEstadoAuto;
          
          await logAuditoria('Depósito', 'Inicio de Armado', `Abrió el pedido #${String(id).slice(0, 8)} y pasó a En Proceso.`);
        }

        setPedido(dataPedido);
        setEditNombre(dataPedido.nombre_cliente || '');
        setEditTelefono(dataPedido.whatsapp_id || '');
        setEditDireccion(dataPedido.direccion || '');
      }

      const { data: dataDetalles } = await supabase
        .from('detalle_pedidos')
        .select(`id_detalle, cantidad, precio_congelado, id_producto, productos (nombre, stock_fisico)`)
        .eq('id_pedido', id);

      if (dataDetalles) setDetalles(dataDetalles);

      const { data: dataInv } = await supabase
        .from('productos')
        .select('*')
        .eq('activo', true)
        .order('nombre', { ascending: true });

      if (dataInv) setInventarioProductos(dataInv);
      setLoading(false);
    }

    if (id && autorizado) fetchDetalleYAutomatizar();
  }, [id, autorizado]);

  const toggleMarca = (idProducto: string) => {
    setProductosMarcados((prev) => ({ ...prev, [idProducto]: !prev[idProducto] }));
  };

  const guardarDatosCliente = async () => {
    await supabase.from('pedidos').update({ direccion: editDireccion.trim() }).eq('id_pedido', id);
    if (editTelefono.trim()) {
      await supabase.from('clientes').upsert({ whatsapp_id: editTelefono.trim(), nombre: editNombre.trim() }, { onConflict: 'whatsapp_id' });
    }
    setPedido({ ...pedido, nombre_cliente: editNombre.trim(), whatsapp_id: editTelefono.trim(), direccion: editDireccion.trim() });
    setEditandoCliente(false);
  };

  const cambiarCantidadItem = async (idDetalle: string, idProducto: string, delta: number, cantidadActual: number) => {
    const nuevaCantidad = cantidadActual + delta;
    if (nuevaCantidad <= 0) { eliminarItem(idDetalle); return; }

    await supabase.from('detalle_pedidos').update({ cantidad: nuevaCantidad }).eq('id_detalle', idDetalle);
    const nuevosDetalles = detalles.map(d => d.id_detalle === idDetalle ? { ...d, cantidad: nuevaCantidad } : d);
    setDetalles(nuevosDetalles);

    const nuevoTotal = nuevosDetalles.reduce((acc, item) => acc + (item.precio_congelado * item.cantidad), 0);
    await supabase.from('pedidos').update({ total_compra: nuevoTotal }).eq('id_pedido', id);
    setPedido({ ...pedido, total_compra: nuevoTotal });
  };

  const eliminarItem = async (idDetalle: string) => {
    if (!confirm("¿Eliminar este producto del pedido?")) return;
    await supabase.from('detalle_pedidos').delete().eq('id_detalle', idDetalle);
    const nuevosDetalles = detalles.filter(d => d.id_detalle !== idDetalle);
    setDetalles(nuevosDetalles);
    const nuevoTotal = nuevosDetalles.reduce((acc, item) => acc + (item.precio_congelado * item.cantidad), 0);
    await supabase.from('pedidos').update({ total_compra: nuevoTotal }).eq('id_pedido', id);
    setPedido({ ...pedido, total_compra: nuevoTotal });
  };

  const agregarProductoAlPedido = async (prod: any) => {
    const existente = detalles.find(d => d.id_producto === prod.id_producto);
    if (existente) { cambiarCantidadItem(existente.id_detalle, prod.id_producto, 1, existente.cantidad); return; }

    const { data } = await supabase
      .from('detalle_pedidos')
      .insert([{ id_pedido: id, id_producto: prod.id_producto, cantidad: 1, precio_congelado: prod.precio }])
      .select(`id_detalle, cantidad, precio_congelado, id_producto, productos (nombre, stock_fisico)`).single();

    if (data) {
      const nuevosDetalles = [...detalles, data];
      setDetalles(nuevosDetalles);
      const nuevoTotal = nuevosDetalles.reduce((acc, item) => acc + (item.precio_congelado * item.cantidad), 0);
      await supabase.from('pedidos').update({ total_compra: nuevoTotal }).eq('id_pedido', id);
      setPedido({ ...pedido, total_compra: nuevoTotal });
    }
  };

  const confirmarArmadoYDescontar = async () => {
    if (!window.confirm("¿Confirmar armado y descontar stock del sistema?")) return;
    setProcesando(true);
    try {
      for (const item of detalles) {
        const stockActual = item.productos?.stock_fisico || 0;
        const nuevoStock = stockActual - item.cantidad;
        await supabase.from('productos').update({ stock_fisico: nuevoStock >= 0 ? nuevoStock : 0 }).eq('id_producto', item.id_producto);
      }
      await supabase.from('pedidos').update({ estado: 'Armado' }).eq('id_pedido', id);
      await logAuditoria('Depósito', 'Picking Completado', `Pedido #${String(id).slice(0, 8)} armado y descontado.`);
      alert("✅ ¡Pedido armado y stock descontado con éxito!");
      router.push('/pedidos'); 
    } catch (error) {
      alert("Hubo un error al procesar el pedido.");
    } finally {
      setProcesando(false);
    }
  };

  if (!autorizado) return <main style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', backgroundColor: '#0a0a0a', color: '#9ca3af' }}><p>Verificando...</p></main>;
  if (loading) return <div style={{ textAlign: 'center', padding: '40px', color: '#a1a1aa' }}>Cargando detalles...</div>;
  if (!pedido) return <div style={{ textAlign: 'center', padding: '40px', color: '#a1a1aa' }}>No se encontró el pedido.</div>;

  const obtenerBadgeEnvio = (estado: string) => {
    if (estado?.includes('Full')) return { texto: '🚀 ENVÍO FULL', fondo: '#3b0764', color: '#e9d5ff', borde: '#6b21a8' };
    if (estado?.includes('Mañana')) return { texto: '☀️ TURNO MAÑANA', fondo: '#422006', color: '#fef08a', borde: '#854d0e' };
    if (estado?.includes('Tarde')) return { texto: '🌙 TURNO TARDE', fondo: '#082f49', color: '#bae6fd', borde: '#0369a1' };
    return { texto: '📦 ESTÁNDAR', fondo: '#27272a', color: '#f4f4f5', borde: '#3f3f46' };
  };

  const badge = obtenerBadgeEnvio(pedido.estado);
  const todosListos = detalles.length > 0 && detalles.every(item => productosMarcados[item.id_producto]);
  const productosFiltradosAgregado = inventarioProductos.filter(p => p.nombre?.toLowerCase().includes(busqProdNuevo.toLowerCase().trim()));

  return (
    <main className="layout-armado">
      <style>{`
        /* --- ESTILOS RESPONSIVOS PARA VISTA DE ARMADO --- */
        .layout-armado { padding: 20px; background-color: #0a0a0a; min-height: 100vh; color: #f4f4f5; font-family: sans-serif; display: flex; flex-direction: column; align-items: center; }
        .contenedor-max { width: 100%; max-width: 800px; }
        
        .encabezado { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; flex-wrap: wrap; gap: 15px; }
        .titulo { font-size: 1.8rem; margin: 0; color: #f4f4f5; }
        .badge-turno { padding: 6px 14px; border-radius: 20px; font-weight: bold; font-size: 0.85rem; }
        
        .tarjeta-info { background-color: #121214; padding: 20px; border-radius: 12px; border: 1px solid #27272a; margin-bottom: 25px; box-shadow: 0 4px 6px rgba(0,0,0,0.4); display: flex; flex-direction: column; gap: 10px; }
        .header-info { display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #27272a; padding-bottom: 10px; flex-wrap: wrap; gap: 10px; }
        .btn-chico { border: none; padding: 6px 12px; border-radius: 6px; font-size: 0.8rem; font-weight: bold; cursor: pointer; }
        
        .tabla-contenedor { background-color: #121214; border-radius: 12px; border: 1px solid #27272a; margin-bottom: 25px; overflow-x: auto; -webkit-overflow-scrolling: touch; }
        table { width: 100%; border-collapse: collapse; min-width: 500px; }
        th { background-color: #18181b; color: #a1a1aa; padding: 12px; text-transform: uppercase; font-size: 0.85rem; text-align: left; }
        td { padding: 14px; border-bottom: 1px solid #27272a; }
        tr:last-child td { border-bottom: none; }
        
        .controles-cantidad { display: flex; align-items: center; gap: 8px; justify-content: center; }
        .btn-cant { background-color: #27272a; color: #fff; border: none; width: 32px; height: 32px; border-radius: 6px; font-weight: bold; cursor: pointer; }
        
        .btn-grande { width: 100%; padding: 16px; border: none; border-radius: 10px; font-size: 1.05rem; font-weight: bold; color: #fff; cursor: pointer; transition: background-color 0.2s; box-shadow: 0 4px 12px rgba(22, 163, 74, 0.3); }

        @media (max-width: 600px) {
          .layout-armado { padding: 10px; }
          .encabezado { flex-direction: column; align-items: stretch; text-align: center; }
          .badge-turno { display: inline-block; text-align: center; }
          .header-info { flex-direction: column; align-items: stretch; }
          .header-info div { display: flex; flex-direction: column; gap: 5px; }
          .header-info .btn-chico { width: 100%; }
        }
      `}</style>

      <div className="contenedor-max">
        <div style={{ marginBottom: '20px' }}>
          <Link href="/pedidos" style={{ color: '#818cf8', textDecoration: 'none', fontWeight: 'bold' }}>🔙 Volver a pedidos</Link>
        </div>

        <div className="encabezado">
          <h1 className="titulo">Armar #{String(pedido.id_pedido).slice(0, 8)}</h1>
          <span className="badge-turno" style={{ backgroundColor: badge.fondo, color: badge.color, border: `1px solid ${badge.borde}` }}>{badge.texto}</span>
        </div>

        <div className="tarjeta-info">
          <div className="header-info">
            <span style={{ fontWeight: 'bold', fontSize: '1.1rem' }}>👤 Datos del Envío</span>
            {!editandoCliente ? (
              <button className="btn-chico" style={{ backgroundColor: '#2563eb', color: '#fff' }} onClick={() => setEditandoCliente(true)}>✏️ Editar Datos</button>
            ) : (
              <div>
                <button className="btn-chico" style={{ backgroundColor: '#16a34a', color: '#fff' }} onClick={guardarDatosCliente}>💾 Guardar</button>
                <button className="btn-chico" style={{ backgroundColor: '#27272a', color: '#fff' }} onClick={() => setEditandoCliente(false)}>Cancelar</button>
              </div>
            )}
          </div>

          {!editandoCliente ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
              <p style={{ margin: 0 }}><strong>Cliente:</strong> {pedido.nombre_cliente || 'Sin nombre'}</p>
              <p style={{ margin: 0 }}><strong>Teléfono:</strong> {pedido.whatsapp_id || '-'}</p>
              <p style={{ margin: 0 }}><strong>Dirección:</strong> {pedido.direccion || '-'}</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <input type="text" value={editNombre} onChange={e => setEditNombre(e.target.value)} placeholder="Nombre" style={{ padding: '10px', background: '#09090b', border: '1px solid #27272a', color: '#fff', borderRadius: '6px' }} />
              <input type="text" value={editTelefono} onChange={e => setEditTelefono(e.target.value)} placeholder="Teléfono" style={{ padding: '10px', background: '#09090b', border: '1px solid #27272a', color: '#fff', borderRadius: '6px' }} />
              <input type="text" value={editDireccion} onChange={e => setEditDireccion(e.target.value)} placeholder="Dirección" style={{ padding: '10px', background: '#09090b', border: '1px solid #27272a', color: '#fff', borderRadius: '6px' }} />
            </div>
          )}
          
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '10px', borderTop: '1px solid #27272a', paddingTop: '10px' }}>
            <span style={{ color: '#a1a1aa' }}>{pedido.estado}</span>
            <span style={{ fontSize: '1.2rem', fontWeight: 'bold', color: '#10b981' }}>Total: ${pedido.total_compra}</span>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px', flexWrap: 'wrap', gap: '10px' }}>
          <h2 style={{ fontSize: '1.2rem', margin: 0 }}>Lista de Picking:</h2>
          <button className="btn-chico" style={{ backgroundColor: '#4f46e5', color: '#fff', padding: '10px 15px' }} onClick={() => setAgregandoProducto(!agregandoProducto)}>
            {agregandoProducto ? '✖ Cerrar buscador' : '➕ Agregar Producto'}
          </button>
        </div>

        {agregandoProducto && (
          <div style={{ backgroundColor: '#18181b', padding: '15px', borderRadius: '10px', marginBottom: '20px' }}>
            <input type="text" placeholder="🔍 Buscar producto en inventario..." value={busqProdNuevo} onChange={e => setBusqProdNuevo(e.target.value)} style={{ width: '100%', padding: '10px', background: '#09090b', border: '1px solid #27272a', color: '#fff', borderRadius: '6px', marginBottom: '10px', boxSizing: 'border-box' }} />
            <div style={{ maxHeight: '180px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '5px' }}>
              {productosFiltradosAgregado.map(p => (
                <div key={p.id_producto} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#09090b', padding: '10px', borderRadius: '6px' }}>
                  <span>{p.nombre} <span style={{ color: '#10b981' }}>${p.precio}</span></span>
                  <button className="btn-chico" style={{ backgroundColor: '#10b981', color: '#fff' }} onClick={() => agregarProductoAlPedido(p)}>+ Añadir</button>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="tabla-contenedor">
          <table>
            <thead>
              <tr>
                <th style={{ textAlign: 'center', width: '50px' }}>Ok</th>
                <th>Producto</th>
                <th style={{ textAlign: 'center' }}>Cant.</th>
                <th style={{ textAlign: 'center' }}>🗑️</th>
              </tr>
            </thead>
            <tbody>
              {detalles.map((item, index) => {
                const marcado = productosMarcados[item.id_producto];
                return (
                  <tr key={index} style={{ backgroundColor: marcado ? '#09090b' : 'transparent', opacity: marcado ? 0.6 : 1 }}>
                    <td style={{ textAlign: 'center' }}>
                      <input type="checkbox" checked={marcado || false} onChange={() => toggleMarca(item.id_producto)} style={{ width: '22px', height: '22px', accentColor: '#2563eb' }} />
                    </td>
                    <td style={{ textDecoration: marcado ? 'line-through' : 'none' }}>
                      {item.productos?.nombre}
                      <div style={{ fontSize: '0.8rem', color: '#10b981' }}>${item.precio_congelado * item.cantidad}</div>
                    </td>
                    <td>
                      <div className="controles-cantidad">
                        <button className="btn-cant" onClick={() => cambiarCantidadItem(item.id_detalle, item.id_producto, -1, item.cantidad)}>-</button>
                        <span>{item.cantidad}</span>
                        <button className="btn-cant" onClick={() => cambiarCantidadItem(item.id_detalle, item.id_producto, 1, item.cantidad)}>+</button>
                      </div>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <button onClick={() => eliminarItem(item.id_detalle)} style={{ background: 'none', border: 'none', color: '#ef4444', fontSize: '1.2rem', cursor: 'pointer' }}>✖</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <button 
          className="btn-grande"
          onClick={confirmarArmadoYDescontar}
          disabled={procesando}
          style={{ backgroundColor: procesando ? '#3f3f46' : '#16a34a' }}
        >
          {procesando ? 'Procesando...' : '📦 Confirmar Armado y Descontar'}
        </button>

      </div>
    </main>
  );
}