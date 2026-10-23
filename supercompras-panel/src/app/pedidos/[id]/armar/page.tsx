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
          
          await supabase
            .from('pedidos')
            .update({ estado: nuevoEstadoAuto })
            .eq('id_pedido', id);

          dataPedido.estado = nuevoEstadoAuto;
          
          await logAuditoria(
            'Depósito', 
            'Inicio de Armado', 
            `Abrió el pedido #${String(id).slice(0, 8)} y pasó automáticamente a En Proceso.`
          );
        }

        setPedido(dataPedido);
        setEditNombre(dataPedido.nombre_cliente || '');
        setEditTelefono(dataPedido.whatsapp_id || '');
        setEditDireccion(dataPedido.direccion || '');
      }

      const { data: dataDetalles } = await supabase
        .from('detalle_pedidos')
        .select(`
          id_detalle,
          cantidad, 
          precio_congelado, 
          id_producto,
          productos (nombre, stock_fisico)
        `)
        .eq('id_pedido', id);

      if (dataDetalles) setDetalles(dataDetalles);

      // Traer inventario para poder agregar productos nuevos si es necesario
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
    setProductosMarcados((prev) => ({
      ...prev,
      [idProducto]: !prev[idProducto]
    }));
  };

  // --- GUARDAR CAMBIOS DE CLIENTE Y DIRECCIÓN ---
  const guardarDatosCliente = async () => {
    const { error } = await supabase
      .from('pedidos')
      .update({
        direccion: editDireccion.trim()
      })
      .eq('id_pedido', id);

    if (error) {
      alert("Error al actualizar la dirección.");
      console.error(error);
      return;
    }

    // Si cambió el teléfono o nombre, actualizamos en clientes
    if (editTelefono.trim()) {
      await supabase
        .from('clientes')
        .upsert({ whatsapp_id: editTelefono.trim(), nombre: editNombre.trim() }, { onConflict: 'whatsapp_id' });
    }

    setPedido({
      ...pedido,
      nombre_cliente: editNombre.trim(),
      whatsapp_id: editTelefono.trim(),
      direccion: editDireccion.trim()
    });

    setEditandoCliente(false);
    alert("✅ Datos actualizados correctamente.");
  };

  // --- MODIFICAR CANTIDAD DE UN ÍTEM EN EL PEDIDO ---
  const cambiarCantidadItem = async (idDetalle: string, idProducto: string, delta: number, cantidadActual: number) => {
    const nuevaCantidad = cantidadActual + delta;
    if (nuevaCantidad <= 0) {
      eliminarItem(idDetalle);
      return;
    }

    // Actualizar en detalle_pedidos
    const { error } = await supabase
      .from('detalle_pedidos')
      .update({ cantidad: nuevaCantidad })
      .eq('id_detalle', idDetalle);

    if (error) {
      alert("Error al modificar la cantidad.");
      return;
    }

    // Actualizar estado local
    const nuevosDetalles = detalles.map(d => d.id_detalle === idDetalle ? { ...d, cantidad: nuevaCantidad } : d);
    setDetalles(nuevosDetalles);

    // Recalcular total y actualizar pedido
    const nuevoTotal = nuevosDetalles.reduce((acc, item) => acc + (item.precio_congelado * item.cantidad), 0);
    await supabase.from('pedidos').update({ total_compra: nuevoTotal }).eq('id_pedido', id);
    setPedido({ ...pedido, total_compra: nuevoTotal });
  };

  // --- ELIMINAR UN ÍTEM DEL PEDIDO ---
  const eliminarItem = async (idDetalle: string) => {
    if (!confirm("¿Eliminar este producto del pedido?")) return;

    const { error } = await supabase
      .from('detalle_pedidos')
      .delete()
      .eq('id_detalle', idDetalle);

    if (error) {
      alert("Error al eliminar el producto.");
      return;
    }

    const nuevosDetalles = detalles.filter(d => d.id_detalle !== idDetalle);
    setDetalles(nuevosDetalles);

    const nuevoTotal = nuevosDetalles.reduce((acc, item) => acc + (item.precio_congelado * item.cantidad), 0);
    await supabase.from('pedidos').update({ total_compra: nuevoTotal }).eq('id_pedido', id);
    setPedido({ ...pedido, total_compra: nuevoTotal });
  };

  // --- AGREGAR NUEVO PRODUCTO AL PEDIDO EN VIVO ---
  const agregarProductoAlPedido = async (prod: any) => {
    // Verificar si ya está en el detalle
    const existente = detalles.find(d => d.id_producto === prod.id_producto);
    if (existente) {
      cambiarCantidadItem(existente.id_detalle, prod.id_producto, 1, existente.cantidad);
      return;
    }

    const { data, error } = await supabase
      .from('detalle_pedidos')
      .insert([{
        id_pedido: id,
        id_producto: prod.id_producto,
        cantidad: 1,
        precio_congelado: prod.precio
      }])
      .select(`
        id_detalle,
        cantidad, 
        precio_congelado, 
        id_producto,
        productos (nombre, stock_fisico)
      `)
      .single();

    if (error) {
      alert("Error al agregar producto.");
      console.error(error);
      return;
    }

    const nuevosDetalles = [...detalles, data];
    setDetalles(nuevosDetalles);

    const nuevoTotal = nuevosDetalles.reduce((acc, item) => acc + (item.precio_congelado * item.cantidad), 0);
    await supabase.from('pedidos').update({ total_compra: nuevoTotal }).eq('id_pedido', id);
    setPedido({ ...pedido, total_compra: nuevoTotal });
    setAgregandoProducto(false);
    setBusqProdNuevo('');
  };

  // --- CONFIRMAR ARMADO Y DESCONTAR STOCK ---
  const confirmarArmadoYDescontar = async () => {
    const confirmar = window.confirm("¿Estás seguro de cerrar el pedido? Esto descontará el stock y le avisará al cliente por WhatsApp que ya está listo.");
    if (!confirmar) return;

    setProcesando(true);

    try {
      for (const item of detalles) {
        const stockActual = item.productos?.stock_fisico || 0;
        const nuevoStock = stockActual - item.cantidad;

        await supabase
          .from('productos')
          .update({ stock_fisico: nuevoStock >= 0 ? nuevoStock : 0 }) 
          .eq('id_producto', item.id_producto);
      }

      await supabase
        .from('pedidos')
        .update({ estado: 'Armado' })
        .eq('id_pedido', id);

      await fetch('/api/notificar-pedido', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id_pedido: id })
      }).catch(err => console.error("Error silencioso al notificar por WhatsApp:", err));

      await logAuditoria(
        'Depósito', 
        'Picking Completado', 
        `Completó el armado del pedido #${String(id).slice(0, 8)}, descontó ${detalles.length} productos y notificó al cliente.`
      );

      alert("✅ ¡Pedido armado, stock descontado y cliente notificado con éxito!");
      router.push('/pedidos'); 

    } catch (error) {
      console.error("Error al procesar:", error);
      alert("Hubo un error al descontar el stock o procesar el pedido.");
    } finally {
      setProcesando(false);
    }
  };

  if (!autorizado) {
    return (
      <main style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', backgroundColor: '#0a0a0a', color: '#9ca3af' }}>
        <p style={{ fontSize: '1.2rem', fontWeight: 'bold' }}>Verificando accesos...</p>
      </main>
    );
  }

  if (loading) return <div style={{ textAlign: 'center', padding: '40px', color: '#a1a1aa', fontSize: '1.1rem', backgroundColor: '#0a0a0a', minHeight: '100vh' }}>Cargando detalles para armado...</div>;
  if (!pedido) return <div style={{ textAlign: 'center', padding: '40px', color: '#a1a1aa', fontSize: '1.1rem', backgroundColor: '#0a0a0a', minHeight: '100vh' }}>No se encontró el pedido.</div>;

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
    <main style={{ padding: '20px', backgroundColor: '#0a0a0a', minHeight: '100vh', color: '#f4f4f5', fontFamily: 'sans-serif', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <div style={{ width: '100%', maxWidth: '800px' }}>
        
        {/* Enlace para Volver */}
        <div style={{ marginBottom: '20px' }}>
          <Link href="/pedidos" style={{ color: '#818cf8', textDecoration: 'none', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '5px', width: 'fit-content' }}>
            🔙 Volver a la lista de pedidos
          </Link>
        </div>

        {/* Encabezado */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '15px' }}>
          <h1 style={{ fontSize: '1.8rem', margin: 0, color: '#f4f4f5' }}>
            Armar Pedido #{String(pedido.id_pedido).slice(0, 8)}
          </h1>
          <span style={{ backgroundColor: badge.fondo, color: badge.color, border: `1px solid ${badge.borde}`, padding: '6px 14px', borderRadius: '20px', fontWeight: 'bold', fontSize: '0.85rem' }}>
            {badge.texto}
          </span>
        </div>

        {/* Tarjeta de Información del Cliente (Editable) */}
        <div style={{ marginBottom: '25px', backgroundColor: '#121214', padding: '20px', borderRadius: '12px', border: '1px solid #27272a', boxShadow: '0 4px 6px rgba(0,0,0,0.4)', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #27272a', paddingBottom: '10px' }}>
            <span style={{ fontWeight: 'bold', fontSize: '1.1rem', color: '#f4f4f5' }}>👤 Datos del Cliente y Envío</span>
            {!editandoCliente ? (
              <button onClick={() => setEditandoCliente(true)} style={{ backgroundColor: '#2563eb', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: '6px', fontSize: '0.8rem', fontWeight: 'bold', cursor: 'pointer' }}>
                ✏️ Editar Datos
              </button>
            ) : (
              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={guardarDatosCliente} style={{ backgroundColor: '#16a34a', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: '6px', fontSize: '0.8rem', fontWeight: 'bold', cursor: 'pointer' }}>
                  💾 Guardar
                </button>
                <button onClick={() => setEditandoCliente(false)} style={{ backgroundColor: '#27272a', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: '6px', fontSize: '0.8rem', fontWeight: 'bold', cursor: 'pointer' }}>
                  Cancelar
                </button>
              </div>
            )}
          </div>

          {!editandoCliente ? (
            <>
              <p style={{ margin: 0, color: '#f4f4f5', fontSize: '1.05rem' }}><strong>Cliente:</strong> {pedido.nombre_cliente || 'Sin nombre'}</p>
              <p style={{ margin: 0, color: '#f4f4f5', fontSize: '1rem' }}><strong>Teléfono:</strong> {pedido.whatsapp_id || 'No especificado'}</p>
              <p style={{ margin: 0, color: '#f4f4f5', fontSize: '1rem' }}><strong>Dirección:</strong> {pedido.direccion || 'No especificada'}</p>
            </>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '5px' }}>
              <div>
                <label style={{ fontSize: '0.8rem', color: '#a1a1aa', display: 'block', marginBottom: '3px' }}>Nombre:</label>
                <input type="text" value={editNombre} onChange={(e) => setEditNombre(e.target.value)} style={{ width: '100%', padding: '8px', backgroundColor: '#09090b', border: '1px solid #27272a', color: '#fff', borderRadius: '6px', outline: 'none' }} />
              </div>
              <div>
                <label style={{ fontSize: '0.8rem', color: '#a1a1aa', display: 'block', marginBottom: '3px' }}>Teléfono / WhatsApp:</label>
                <input type="text" value={editTelefono} onChange={(e) => setEditTelefono(e.target.value)} style={{ width: '100%', padding: '8px', backgroundColor: '#09090b', border: '1px solid #27272a', color: '#fff', borderRadius: '6px', outline: 'none' }} />
              </div>
              <div>
                <label style={{ fontSize: '0.8rem', color: '#a1a1aa', display: 'block', marginBottom: '3px' }}>Dirección:</label>
                <input type="text" value={editDireccion} onChange={(e) => setEditDireccion(e.target.value)} style={{ width: '100%', padding: '8px', backgroundColor: '#09090b', border: '1px solid #27272a', color: '#fff', borderRadius: '6px', outline: 'none' }} />
              </div>
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '5px', borderTop: '1px solid #27272a', paddingTop: '10px' }}>
            <span style={{ color: '#a1a1aa', fontSize: '0.9rem' }}>Estado: {pedido.estado}</span>
            <span style={{ fontSize: '1.2rem', fontWeight: 'bold', color: '#10b981' }}>Total: ${pedido.total_compra}</span>
          </div>
        </div>

        {/* Subtítulo de Picking y Botón Agregar Producto */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px', flexWrap: 'wrap', gap: '10px' }}>
          <h2 style={{ fontSize: '1.2rem', margin: 0, color: '#f4f4f5' }}>Lista de Picking y Ítems:</h2>
          <button onClick={() => setAgregandoProducto(!agregandoProducto)} style={{ backgroundColor: '#4f46e5', color: '#fff', border: 'none', padding: '8px 14px', borderRadius: '8px', fontWeight: 'bold', fontSize: '0.85rem', cursor: 'pointer' }}>
            {agregandoProducto ? '✖ Cerrar buscador' : '➕ Agregar Producto'}
          </button>
        </div>

        {/* Buscador para Agregar Producto en Vivo */}
        {agregandoProducto && (
          <div style={{ backgroundColor: '#18181b', padding: '15px', borderRadius: '10px', border: '1px solid #3f3f46', marginBottom: '20px' }}>
            <input type="text" placeholder="🔍 Buscar producto en el inventario..." value={busqProdNuevo} onChange={(e) => setBusqProdNuevo(e.target.value)} style={{ width: '100%', padding: '10px', backgroundColor: '#09090b', border: '1px solid #27272a', color: '#fff', borderRadius: '6px', outline: 'none', marginBottom: '10px' }} />
            <div style={{ maxHeight: '150px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '5px' }}>
              {productosFiltradosAgregado.map(p => (
                <div key={p.id_producto} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#09090b', padding: '8px 12px', borderRadius: '6px' }}>
                  <span style={{ fontSize: '0.9rem', color: '#f4f4f5' }}>{p.nombre} (${p.precio})</span>
                  <button onClick={() => agregarProductoAlPedido(p)} style={{ backgroundColor: '#10b981', color: '#fff', border: 'none', padding: '4px 10px', borderRadius: '4px', fontSize: '0.8rem', fontWeight: 'bold', cursor: 'pointer' }}>
                    + Añadir
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tabla / Contenedor de Productos */}
        <div style={{ backgroundColor: '#121214', borderRadius: '12px', border: '1px solid #27272a', overflow: 'hidden', marginBottom: '25px', boxShadow: '0 4px 6px rgba(0,0,0,0.4)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #27272a', backgroundColor: '#18181b', color: '#a1a1aa', fontSize: '0.85rem', textTransform: 'uppercase' }}>
                <th style={{ textAlign: 'center', padding: '12px', width: '60px' }}>Listo</th>
                <th style={{ textAlign: 'left', padding: '12px' }}>Producto</th>
                <th style={{ textAlign: 'center', padding: '12px', width: '140px' }}>Cantidad</th>
                <th style={{ textAlign: 'center', padding: '12px', width: '70px' }}>Acción</th>
              </tr>
            </thead>
            <tbody>
              {detalles.map((item, index) => {
                const estaMarcado = productosMarcados[item.id_producto];
                return (
                  <tr 
                    key={item.id_detalle || index} 
                    style={{ 
                      borderBottom: index < detalles.length - 1 ? '1px solid #27272a' : 'none', 
                      backgroundColor: estaMarcado ? '#09090b' : '#121214', 
                      opacity: estaMarcado ? 0.5 : 1, 
                      transition: 'all 0.2s ease-in-out' 
                    }}
                  >
                    <td style={{ textAlign: 'center', padding: '14px' }}>
                      <input 
                        type="checkbox" 
                        checked={estaMarcado || false}
                        onChange={() => toggleMarca(item.id_producto)}
                        style={{ width: '20px', height: '20px', cursor: 'pointer', accentColor: '#2563eb' }}
                      />
                    </td>
                    <td style={{ padding: '14px', textDecoration: estaMarcado ? 'line-through' : 'none', color: estaMarcado ? '#71717a' : '#f4f4f5', fontWeight: '500' }}>
                      {item.productos?.nombre || 'Producto desconocido'}
                      <div style={{ fontSize: '0.75rem', color: '#10b981' }}>Subtotal: ${item.precio_congelado * item.cantidad}</div>
                    </td>
                    <td style={{ textAlign: 'center', padding: '14px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                        <button onClick={() => cambiarCantidadItem(item.id_detalle, item.id_producto, -1, item.cantidad)} style={{ backgroundColor: '#27272a', color: '#fff', border: 'none', width: '26px', height: '26px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>-</button>
                        <span style={{ fontSize: '1rem', fontWeight: 'bold', minWidth: '20px' }}>{item.cantidad}</span>
                        <button onClick={() => cambiarCantidadItem(item.id_detalle, item.id_producto, 1, item.cantidad)} style={{ backgroundColor: '#27272a', color: '#fff', border: 'none', width: '26px', height: '26px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>+</button>
                      </div>
                    </td>
                    <td style={{ textAlign: 'center', padding: '14px' }}>
                      <button onClick={() => eliminarItem(item.id_detalle)} title="Eliminar ítem" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', fontSize: '1.1rem' }}>
                        🗑️
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Botón de Confirmación */}
        <button 
          onClick={confirmarArmadoYDescontar}
          disabled={procesando}
          style={{ 
            width: '100%', 
            padding: '16px', 
            backgroundColor: procesando ? '#3f3f46' : '#16a34a', 
            color: '#fff', 
            border: 'none', 
            borderRadius: '10px', 
            fontSize: '1.05rem', 
            fontWeight: 'bold', 
            cursor: procesando ? 'not-allowed' : 'pointer',
            boxShadow: '0 4px 12px rgba(22, 163, 74, 0.3)',
            transition: 'background-color 0.2s'
          }}
        >
          {procesando ? 'Descontando stock...' : '📦 Confirmar Armado y Descontar Stock'}
        </button>

      </div>
    </main>
  );
}