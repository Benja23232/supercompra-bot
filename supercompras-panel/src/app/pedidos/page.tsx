'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { logAuditoria } from '@/lib/auditoria';

export default function Pedidos() {
  const router = useRouter();
  const [autorizado, setAutorizado] = useState(false);
  const [rolActivo, setRolActivo] = useState('');

  const [pedidos, setPedidos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [alertaNuevoPedido, setAlertaNuevoPedido] = useState(false);
  const [filtro, setFiltro] = useState('todos');

  const [pedidosSeleccionados, setPedidosSeleccionados] = useState<any[]>([]);
  const [estadoMasivo, setEstadoMasivo] = useState('En Preparación');

  // --- ESTADOS PARA EL MODAL DE NUEVO PEDIDO MANUAL ---
  const [modalAbierto, setModalAbierto] = useState(false);
  const [productosInventario, setProductosInventario] = useState<any[]>([]);
  const [busqProducto, setBusqProducto] = useState('');
  
  // Formulario del pedido
  const [cliNombre, setCliNombre] = useState('');
  const [cliTelefono, setCliTelefono] = useState('');
  const [cliDireccion, setCliDireccion] = useState('');
  const [turnoElegido, setTurnoElegido] = useState('Mañana'); // 'Mañana', 'Tarde', 'Full'
  const [pagoElegido, setPagoElegido] = useState('Efectivo'); // 'Efectivo', 'Transferencia'
  const [carrito, setCarrito] = useState<any[]>([]); // { id_producto, nombre, precio, cantidad }
  const [guardandoPedido, setGuardandoPedido] = useState(false);
  const [ticketGenerado, setTicketGenerado] = useState('');

  // --- FUNCIÓN DE ALERTA DE AUDIO ---
  const reproducirSonidoAlerta = () => {
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc1 = audioCtx.createOscillator();
      const gain1 = audioCtx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(880, audioCtx.currentTime);
      gain1.gain.setValueAtTime(0.4, audioCtx.currentTime);
      gain1.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.15);
      osc1.connect(gain1);
      gain1.connect(audioCtx.destination);
      osc1.start();
      osc1.stop(audioCtx.currentTime + 0.15);
    } catch (e) {
      console.error("Audio bloqueado:", e);
    }
  };

  async function fetchPedidos() {
    const { data, error } = await supabase
      .from('pedidos')
      .select('*')
      .order('id_pedido', { ascending: false });

    if (error) console.error("Error al traer pedidos:", error);
    else setPedidos(data || []);
    setLoading(false);
  }

  async function fetchProductosInventario() {
    const { data, error } = await supabase
      .from('productos')
      .select('*')
      .eq('activo', true)
      .order('nombre', { ascending: true });

    if (!error && data) {
      setProductosInventario(data);
    }
  }

  useEffect(() => {
    const rol = localStorage.getItem('rolUsuario');
    if (!rol) {
      router.push('/'); 
    } else {
      setRolActivo(rol); 
      setAutorizado(true); 
      fetchPedidos();
      fetchProductosInventario();
    }

    const channel = supabase
      .channel('cambios-pedidos-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'pedidos' },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            setAlertaNuevoPedido(true);
            reproducirSonidoAlerta();
            setTimeout(() => setAlertaNuevoPedido(false), 6000);
          }
          fetchPedidos();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [router]);

  // --- LÓGICA DEL CARRITO MANUAL ---
  const agregarAlCarrito = (prod: any) => {
    const existente = carrito.find(item => item.id_producto === prod.id_producto);
    if (existente) {
      setCarrito(carrito.map(item => 
        item.id_producto === prod.id_producto ? { ...item, cantidad: item.cantidad + 1 } : item
      ));
    } else {
      setCarrito([...carrito, { id_producto: prod.id_producto, nombre: prod.nombre, precio: prod.precio, cantidad: 1, stock_fisico: prod.stock_fisico }]);
    }
  };

  const cambiarCantidadCarrito = (id_producto: string, delta: number) => {
    setCarrito(carrito.map(item => {
      if (item.id_producto === id_producto) {
        const nuevaCant = item.cantidad + delta;
        return nuevaCant > 0 ? { ...item, cantidad: nuevaCant } : null;
      }
      return item;
    }).filter(Boolean));
  };

  const totalCarrito = carrito.reduce((acc, item) => acc + (item.precio * item.cantidad), 0);

  // --- GUARDAR PEDIDO MANUAL, DETALLE, STOCK Y PAGO ---
  const guardarPedidoManual = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cliNombre.trim() || !cliDireccion.trim()) {
      alert("Completá el nombre del cliente y la dirección.");
      return;
    }
    if (carrito.length === 0) {
      alert("Agregá al menos un producto al pedido.");
      return;
    }

    setGuardandoPedido(true);

    try {
      // 1. Manejar cliente
      let telefonoLimpio = cliTelefono.trim();
      if (!telefonoLimpio) {
        telefonoLimpio = `manual_${Date.now()}`;
      }

      await supabase
        .from('clientes')
        .upsert({ whatsapp_id: telefonoLimpio, nombre: cliNombre.trim() }, { onConflict: 'whatsapp_id' });

      // 2. Estado combinando estado inicial + turno
      const estadoInicial = `Pendiente - ${turnoElegido}`;

      // 3. Insertar el pedido en 'pedidos'
      const { data: pedidoData, error: pedidoError } = await supabase
        .from('pedidos')
        .insert([{
          whatsapp_id: telefonoLimpio,
          direccion: cliDireccion.trim(),
          total_compra: totalCarrito,
          estado: estadoInicial
        }])
        .select()
        .single();

      if (pedidoError) throw pedidoError;
      const idNuevoPedido = pedidoData.id_pedido;

      // 4. Registrar el pago en la tabla 'pagos'
      const { error: pagoError } = await supabase
        .from('pagos')
        .insert([{
          id_pedido: idNuevoPedido,
          metodo: pagoElegido,
          monto: totalCarrito,
          estado: pagoElegido === 'Transferencia' ? 'Pendiente' : 'Completado',
          fecha_pago: new Date().toISOString()
        }]);

      if (pagoError) {
        console.error("Error detallado al registrar el pago:", JSON.stringify(pagoError, null, 2));
      }

      // 5. Insertar en 'detalle_pedidos' y descontar stock de 'productos'
      for (const item of carrito) {
        const { error: detError } = await supabase
          .from('detalle_pedidos')
          .insert([{
            id_pedido: idNuevoPedido,
            id_producto: item.id_producto,
            cantidad: item.cantidad,
            precio_congelado: item.precio
          }]);

        if (detError) console.error("Error al insertar detalle:", detError);

        const nuevoStock = Math.max(0, (item.stock_fisico || 0) - item.cantidad);
        const { error: stockError } = await supabase
          .from('productos')
          .update({ stock_fisico: nuevoStock })
          .eq('id_producto', item.id_producto);

        if (stockError) console.error("Error al descontar stock:", stockError);
      }

      await logAuditoria(
        'Pedidos',
        'Creación manual',
        `Creó manualmente el pedido #${String(idNuevoPedido).slice(0, 8)} para ${cliNombre} por $${totalCarrito}`
      );

      // 6. Generar resumen copiable para WhatsApp
      let resumen = `🛒 *SUPERCOMPRAS - NUEVO PEDIDO* 🛒\n\n`;
      resumen += `👤 *Cliente:* ${cliNombre}\n`;
      resumen += `📍 *Dirección:* ${cliDireccion}\n`;
      resumen += `📦 *Turno:* ${turnoElegido}\n`;
      resumen += `💳 *Pago:* ${pagoElegido}\n\n`;
      resumen += `*Detalle de productos:*\n`;
      carrito.forEach(i => {
        resumen += `▪️ ${i.cantidad}x ${i.nombre} ($${i.precio * i.cantidad})\n`;
      });
      resumen += `\n💰 *TOTAL A PAGAR: $${totalCarrito}*\n\n¡Gracias por tu compra! 🙏`;

      setTicketGenerado(resumen);
      fetchPedidos();
      fetchProductosInventario();

    } catch (err: any) {
      console.error("Error detallado al crear pedido:", JSON.stringify(err, null, 2));
      alert(`Hubo un error al registrar el pedido: ${err?.message || JSON.stringify(err)}`);
    } finally {
      setGuardandoPedido(false);
    }
  };

  const reiniciarModal = () => {
    setModalAbierto(false);
    setCliNombre('');
    setCliTelefono('');
    setCliDireccion('');
    setTurnoElegido('Mañana');
    setPagoElegido('Efectivo');
    setCarrito([]);
    setTicketGenerado('');
  };

  // Filtrado por turno según los botones superiores
  const pedidosPorTurno = pedidos.filter((pedido) => {
    if (filtro === 'todos') return true;
    if (filtro === 'full') return pedido.estado?.includes('Full');
    if (filtro === 'manana') return pedido.estado?.includes('Mañana');
    if (filtro === 'tarde') return pedido.estado?.includes('Tarde');
    return true;
  });

  const pedidosPendientes = pedidosPorTurno.filter(p => !p.estado || p.estado.includes('Pendiente'));
  const pedidosEnProceso = pedidosPorTurno.filter(p => 
    p.estado?.includes('En Preparación') || 
    p.estado?.includes('En Preparacion') || 
    p.estado?.includes('En Proceso') ||
    p.estado?.includes('Armado') 
  );
  const pedidosEnReparto = pedidosPorTurno.filter(p => p.estado?.includes('En Reparto'));
  const pedidosFinalizados = pedidosPorTurno.filter(p => p.estado?.includes('Entregado') || p.estado?.includes('Cancelado'));

  const cambiarEstado = async (id: any, nuevoEstadoElegido: string, estadoAnterior: string) => {
    let estadoFinal = nuevoEstadoElegido;

    if (['Pendiente', 'En Preparación', 'Armado', 'En Reparto', 'Entregado', 'Cancelado'].includes(nuevoEstadoElegido)) {
      if (estadoAnterior.includes('Mañana')) estadoFinal = `${nuevoEstadoElegido} - Mañana`;
      else if (estadoAnterior.includes('Tarde')) estadoFinal = `${nuevoEstadoElegido} - Tarde`;
      else if (estadoAnterior.includes('Full')) estadoFinal = `${nuevoEstadoElegido} - Full`;
    }

    if (estadoFinal === estadoAnterior) return;

    const { error } = await supabase
      .from('pedidos')
      .update({ estado: estadoFinal })
      .eq('id_pedido', id);

    if (error) {
      alert('Error al actualizar el estado.');
      console.error(error);
    } else {
      await logAuditoria(
        'Pedidos',
        'Cambio de estado',
        `Actualizó el estado del pedido #${String(id).slice(0, 8)} de "${estadoAnterior}" a "${estadoFinal}"`
      );
      fetchPedidos(); 
    }
  };

  const cambiarEstadoMasivo = async () => {
    if (pedidosSeleccionados.length === 0) return;

    const { error } = await supabase
      .from('pedidos')
      .update({ estado: estadoMasivo })
      .in('id_pedido', pedidosSeleccionados);

    if (error) {
      alert('Error al actualizar los pedidos seleccionados.');
      console.error(error);
    } else {
      await logAuditoria(
        'Pedidos',
        'Cambio de estado masivo',
        `Actualizó ${pedidosSeleccionados.length} pedidos al estado "${estadoMasivo}"`
      );
      setPedidosSeleccionados([]);
      fetchPedidos();
    }
  };

  const toggleSeleccionPedido = (id: any) => {
    if (pedidosSeleccionados.includes(id)) {
      setPedidosSeleccionados(pedidosSeleccionados.filter(item => item !== id));
    } else {
      setPedidosSeleccionados([...pedidosSeleccionados, id]);
    }
  };

  const seleccionarTodosVisibles = () => {
    const idsVisibles = [...pedidosPendientes, ...pedidosEnProceso, ...pedidosEnReparto, ...pedidosFinalizados].map(p => p.id_pedido);
    if (pedidosSeleccionados.length === idsVisibles.length) {
      setPedidosSeleccionados([]);
    } else {
      setPedidosSeleccionados(idsVisibles);
    }
  };

  const cerrarSesion = () => {
    localStorage.clear();
    router.push('/');
  };

  const abrirDireccionIndividual = (direccion: string) => {
    if (!direccion || direccion.trim() === '') {
      alert("Este pedido no tiene dirección cargada.");
      return;
    }
    const limpia = direccion.trim();
    const dirFinal = limpia.toLowerCase().includes('tres lomas') ? limpia : `${limpia}, Tres Lomas, Buenos Aires`;
    window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(dirFinal)}`, '_blank');
  };

  const abrirRutaEnMapa = () => {
    const pedidosActivos = pedidosPorTurno.filter(
      p => p.direccion && p.direccion.trim() !== '' && !p.estado?.includes('Entregado') && !p.estado?.includes('Cancelado')
    );

    if (pedidosActivos.length === 0) {
      alert("No hay pedidos activos con dirección cargada en este turno para armar la ruta.");
      return;
    }

    const formatearDir = (dir: string) => {
      const limpia = dir.trim();
      if (limpia.toLowerCase().includes('tres lomas')) return limpia;
      return `${limpia}, Tres Lomas, Buenos Aires`;
    };

    const origen = encodeURIComponent(formatearDir(pedidosActivos[0].direccion));
    const direccionDestino = pedidosActivos[pedidosActivos.length - 1].direccion;
    const destinoFinal = encodeURIComponent(formatearDir(direccionDestino));

    const puntosIntermedios = pedidosActivos.slice(1, -1);
    const waypoints = puntosIntermedios.map(p => encodeURIComponent(formatearDir(p.direccion))).join('|');

    let urlMaps = `https://www.google.com/maps/dir/?api=1&origin=${origen}&destination=${destinoFinal}`;
    if (waypoints.length > 0) urlMaps += `&waypoints=${waypoints}`;

    window.open(urlMaps, '_blank');
  };

  const formatearFecha = (fechaIso: string) => {
    if (!fechaIso) return '-';
    const fechaStr = fechaIso.endsWith('Z') || fechaIso.includes('+') ? fechaIso : fechaIso + 'Z';
    const fecha = new Date(fechaStr);
    return fecha.toLocaleString('es-AR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit', hour12: false,
      timeZone: 'America/Argentina/Buenos_Aires'
    });
  };

  if (!autorizado) {
    return (
      <main style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', backgroundColor: '#0a0a0a', color: '#9ca3af' }}>
        <p style={{ fontSize: '1.2rem', fontWeight: 'bold' }}>Verificando acceso...</p>
      </main>
    );
  }

  const renderSeccionPedidos = (lista: any[], tituloSecc: string, descripcion: string) => {
    if (lista.length === 0) {
      return (
        <div style={{ marginBottom: '30px', padding: '30px', backgroundColor: '#121214', borderRadius: '12px', border: '1px solid #27272a', textAlign: 'center' }}>
          <span style={{ fontSize: '2.5rem', display: 'block', marginBottom: '10px' }}>
            {tituloSecc.includes('Espera') ? '⏳' : tituloSecc.includes('Armado') ? '⚙️' : tituloSecc.includes('Reparto') ? '🛵' : '✅'}
          </span>
          <h2 style={{ fontSize: '1.3rem', margin: '0 0 5px 0', color: '#f4f4f5' }}>{tituloSecc} (0)</h2>
          <p style={{ color: '#a1a1aa', margin: 0, fontSize: '0.9rem' }}>No hay pedidos en esta etapa para el turno seleccionado.</p>
        </div>
      );
    }

    return (
      <div style={{ marginBottom: '40px', width: '100%' }}>
        <h2 style={{ fontSize: '1.3rem', margin: '0 0 5px 0', color: '#f4f4f5' }}>{tituloSecc} ({lista.length})</h2>
        <p style={{ color: '#a1a1aa', marginBottom: '15px', marginTop: 0, fontSize: '0.9rem' }}>{descripcion}</p>
        
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '20px', width: '100%' }}>
          {lista.map((pedido) => {
            const estadoActual = pedido.estado || 'Pendiente';
            const estaSeleccionado = pedidosSeleccionados.includes(pedido.id_pedido);

            let valorSelect = estadoActual;
            if (estadoActual.includes('En Preparación') || estadoActual.includes('En Preparacion') || estadoActual.includes('En Proceso')) valorSelect = 'En Preparación';
            else if (estadoActual.includes('Armado')) valorSelect = 'Armado';
            else if (estadoActual.includes('En Reparto')) valorSelect = 'En Reparto';
            else if (estadoActual.includes('Entregado')) valorSelect = 'Entregado';
            else if (estadoActual.includes('Cancelado')) valorSelect = 'Cancelado';
            else if (estadoActual.includes('Pendiente')) valorSelect = 'Pendiente';

            return (
              <div key={pedido.id_pedido} style={{ backgroundColor: '#121214', border: estaSeleccionado ? '2px solid #6366f1' : '1px solid #27272a', borderRadius: '12px', padding: '20px', boxShadow: '0 4px 6px rgba(0,0,0,0.4)', display: 'flex', flexDirection: 'column', gap: '14px', position: 'relative' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #27272a', paddingBottom: '10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <input type="checkbox" checked={estaSeleccionado} onChange={() => toggleSeleccionPedido(pedido.id_pedido)} style={{ width: '18px', height: '18px', cursor: 'pointer', accentColor: '#4f46e5' }} />
                    <span style={{ fontWeight: 'bold', fontSize: '1.1rem', color: '#f4f4f5' }}>#{String(pedido.id_pedido).slice(0, 8)}...</span>
                  </div>
                  <span style={{ fontWeight: 'bold', fontSize: '1.2rem', color: '#10b981' }}>${pedido.total_compra || 0}</span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                  <div style={{ fontSize: '1.05rem', color: '#f4f4f5' }}>👤 <strong>{pedido.nombre_cliente || pedido.whatsapp_id || 'Cliente'}</strong></div>
                  <div style={{ fontSize: '0.85rem', color: '#a1a1aa', display: 'flex', alignItems: 'center', gap: '5px' }}>📅 {formatearFecha(pedido.fecha_creacion)}</div>
                </div>

                <div style={{ backgroundColor: '#09090b', padding: '10px 12px', borderRadius: '8px', border: '1px solid #27272a', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                  <div style={{ fontSize: '0.9rem', color: '#e4e4e7', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    📍 <strong>Dirección:</strong> {pedido.direccion ? pedido.direccion : <span style={{ color: '#f87171' }}>No especificada</span>}
                  </div>
                  {pedido.direccion && (
                    <button onClick={() => abrirDireccionIndividual(pedido.direccion)} title="Abrir ubicación" style={{ background: '#16a34a', color: '#fff', border: 'none', borderRadius: '6px', padding: '6px 10px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 'bold', whiteSpace: 'nowrap' }}>
                      🗺️ Mapa
                    </button>
                  )}
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', color: '#a1a1aa', marginBottom: '6px' }}>Estado y Logística:</label>
                  <select value={valorSelect} onChange={(e) => cambiarEstado(pedido.id_pedido, e.target.value, estadoActual)} style={{ width: '100%', padding: '0.6rem 0.75rem', borderRadius: '8px', border: '1px solid #27272a', cursor: 'pointer', backgroundColor: '#09090b', color: '#f4f4f5', fontSize: '0.9rem', fontWeight: '500', outline: 'none' }}>
                    <option value="Pendiente">Pendiente</option>
                    <option value="Pendiente - Mañana">Pendiente - Mañana</option>
                    <option value="Pendiente - Tarde">Pendiente - Tarde</option>
                    <option value="Pendiente - Full">🚀 Pendiente - Full</option>
                    <option value="En Preparación">⚙️ En Preparación</option>
                    <option value="Armado">📦 Armado (Listo)</option>
                    <option value="En Reparto">🛵 En Reparto</option>
                    <option value="Entregado">Entregado</option>
                    <option value="Cancelado">Cancelado</option>
                  </select>
                </div>

                <div style={{ display: 'flex', gap: '10px', marginTop: '4px' }}>
                  <Link href={`/pedidos/${pedido.id_pedido}`} style={{ flex: 1, textAlign: 'center', padding: '10px 8px', backgroundColor: '#27272a', color: '#f4f4f5', borderRadius: '8px', textDecoration: 'none', fontWeight: 'bold', fontSize: '0.85rem' }}>
                    👁️ Ver Detalle
                  </Link>
                  <Link href={`/pedidos/${pedido.id_pedido}/armar`} style={{ flex: 1, textAlign: 'center', padding: '10px 8px', backgroundColor: '#2563eb', color: '#fff', borderRadius: '8px', textDecoration: 'none', fontWeight: 'bold', fontSize: '0.85rem' }}>
                    📦 Armar Pedido
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const productosFiltradosModal = productosInventario.filter(p => 
    p.nombre?.toLowerCase().includes(busqProducto.toLowerCase().trim())
  );

  return (
    <main style={{ padding: '20px', backgroundColor: '#0a0a0a', minHeight: '100vh', color: '#f4f4f5', fontFamily: 'sans-serif', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', alignItems: 'center', paddingBottom: pedidosSeleccionados.length > 0 ? '100px' : '20px' }}>
      <div style={{ width: '100%', maxWidth: '1400px' }}>

        {alertaNuevoPedido && (
          <div style={{ position: 'fixed', top: '20px', right: '20px', backgroundColor: '#10b981', color: '#fff', padding: '15px 25px', borderRadius: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.5)', zIndex: 1000, fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span>🔔 ¡Nuevo pedido ingresado en el sistema!</span>
          </div>
        )}

        <div style={{ marginBottom: '20px', display: 'flex', justifyContent: 'space-between', width: '100%' }}>
          {rolActivo === 'admin' ? (
            <Link href="/dashboard" style={{ color: '#818cf8', textDecoration: 'none', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '5px' }}>
              🔙 Volver al panel principal
            </Link>
          ) : (
            <button onClick={cerrarSesion} style={{ background: 'none', border: 'none', color: '#ef4444', fontWeight: 'bold', fontSize: '0.95rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px' }}>
              🔒 Cerrar Sesión
            </button>
          )}
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '15px', marginBottom: '25px', width: '100%' }}>
          <h1 style={{ margin: 0, fontSize: '1.8rem', color: '#f4f4f5' }}>🛒 Logística y Armado de Pedidos</h1>
          
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <button onClick={() => setModalAbierto(true)} style={{ backgroundColor: '#10b981', color: '#fff', border: 'none', padding: '10px 18px', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', fontSize: '0.9rem' }}>
              ➕ Cargar Pedido Manual
            </button>
            <button onClick={seleccionarTodosVisibles} style={{ backgroundColor: '#27272a', color: '#f4f4f5', border: '1px solid #3f3f46', padding: '10px 18px', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', fontSize: '0.9rem' }}>
              ☑️ Seleccionar Todos
            </button>
            <button onClick={abrirRutaEnMapa} style={{ backgroundColor: '#16a34a', color: '#fff', border: 'none', padding: '10px 18px', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', display: 'flex', gap: '5px', alignItems: 'center', fontSize: '0.9rem' }}>
              🗺️ Ruta (Turno Actual)
            </button>
            <button onClick={fetchPedidos} style={{ backgroundColor: '#27272a', color: '#f4f4f5', border: '1px solid #3f3f46', padding: '10px 18px', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', display: 'flex', gap: '5px', alignItems: 'center', fontSize: '0.9rem' }}>
              🔄 Sincronizar
            </button>
          </div>
        </div>

        <div style={{ backgroundColor: '#121214', padding: '20px', borderRadius: '12px', marginBottom: '35px', border: '1px solid #27272a', width: '100%', boxSizing: 'border-box' }}>
          <h2 style={{ fontSize: '1.05rem', margin: '0 0 15px 0', color: '#f4f4f5' }}>📍 Filtrar por Turno / Envío</h2>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <button onClick={() => setFiltro('todos')} style={{ flex: 1, minWidth: '130px', padding: '10px 15px', borderRadius: '8px', border: '1px solid #27272a', fontWeight: 'bold', fontSize: '0.9rem', backgroundColor: filtro === 'todos' ? '#4f46e5' : '#18181b', color: 'white', cursor: 'pointer' }}>
              📋 Todos ({pedidos.length})
            </button>
            <button onClick={() => setFiltro('full')} style={{ flex: 1, minWidth: '130px', padding: '10px 15px', borderRadius: '8px', border: '1px solid #27272a', fontWeight: 'bold', fontSize: '0.9rem', backgroundColor: filtro === 'full' ? '#4f46e5' : '#18181b', color: 'white', cursor: 'pointer' }}>
              🚀 Envío Full ({pedidos.filter(p => p.estado?.includes('Full')).length})
            </button>
            <button onClick={() => setFiltro('manana')} style={{ flex: 1, minWidth: '130px', padding: '10px 15px', borderRadius: '8px', border: '1px solid #27272a', fontWeight: 'bold', fontSize: '0.9rem', backgroundColor: filtro === 'manana' ? '#4f46e5' : '#18181b', color: 'white', cursor: 'pointer' }}>
              ☀️ Mañana ({pedidos.filter(p => p.estado?.includes('Mañana')).length})
            </button>
            <button onClick={() => setFiltro('tarde')} style={{ flex: 1, minWidth: '130px', padding: '10px 15px', borderRadius: '8px', border: '1px solid #27272a', fontWeight: 'bold', fontSize: '0.9rem', backgroundColor: filtro === 'tarde' ? '#4f46e5' : '#18181b', color: 'white', cursor: 'pointer' }}>
              🌙 Tarde ({pedidos.filter(p => p.estado?.includes('Tarde')).length})
            </button>
          </div>
        </div>
        
        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px', color: '#a1a1aa', fontSize: '1.1rem' }}>Cargando ventas del depósito...</div>
        ) : (
          <div style={{ width: '100%' }}>
            {renderSeccionPedidos(pedidosPendientes, '⏳ Cola de Espera (Pendientes)', 'Pedidos ingresados esperando que un empleado los busque en las estanterías.')}
            {renderSeccionPedidos(pedidosEnProceso, '⚙️ En Armado / Listos', 'Pedidos que ya pasaron a preparación y están en curso o armados listos para salir.')}
            {renderSeccionPedidos(pedidosEnReparto, '🛵 En Reparto (En Camino)', 'Pedidos que ya salieron con el repartidor hacia el domicilio.')}
            {renderSeccionPedidos(pedidosFinalizados, '📦 Historial Terminado', 'Pedidos ya entregados al cliente o cancelados.')}
          </div>
        )}

      </div>

      {/* --- MODAL DE NUEVO PEDIDO MANUAL --- */}
      {modalAbierto && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: 'rgba(0,0,0,0.8)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 2000, padding: '20px', boxSizing: 'border-box' }}>
          <div style={{ backgroundColor: '#121214', border: '1px solid #27272a', borderRadius: '16px', width: '100%', maxWidth: '900px', maxHeight: '90vh', overflowY: 'auto', padding: '30px', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.7)' }}>
            
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '1px solid #27272a', paddingBottom: '15px' }}>
              <h2 style={{ margin: 0, color: '#f4f4f5', fontSize: '1.4rem' }}>📝 Cargar Nuevo Pedido Manual</h2>
              <button onClick={reiniciarModal} style={{ background: 'none', border: 'none', color: '#a1a1aa', fontSize: '1.2rem', cursor: 'pointer', fontWeight: 'bold' }}>✕</button>
            </div>

            {ticketGenerado ? (
              <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <div style={{ backgroundColor: '#09090b', padding: '20px', borderRadius: '8px', border: '1px solid #27272a', textAlign: 'left', whiteSpace: 'pre-wrap', fontFamily: 'monospace', fontSize: '0.95rem', color: '#10b981' }}>
                  {ticketGenerado}
                </div>
                <div style={{ display: 'flex', gap: '15px', justifyContent: 'center' }}>
                  <button onClick={() => { navigator.clipboard.writeText(ticketGenerado); alert("¡Copiado al portapapeles!"); }} style={{ backgroundColor: '#2563eb', color: '#fff', border: 'none', padding: '12px 24px', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer' }}>
                    📋 Copiar Resumen para WhatsApp
                  </button>
                  <button onClick={reiniciarModal} style={{ backgroundColor: '#27272a', color: '#fff', border: '1px solid #3f3f46', padding: '12px 24px', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer' }}>
                    Cerrar y Volver
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={guardarPedidoManual} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                
                {/* Datos del Cliente */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '15px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.85rem', color: '#a1a1aa', marginBottom: '5px' }}>Nombre del Cliente *</label>
                    <input type="text" required value={cliNombre} onChange={(e) => setCliNombre(e.target.value)} placeholder="Ej: Juan Pérez" style={{ width: '100%', padding: '10px', borderRadius: '8px', backgroundColor: '#09090b', border: '1px solid #27272a', color: '#fff', outline: 'none' }} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.85rem', color: '#a1a1aa', marginBottom: '5px' }}>Teléfono / WhatsApp (Opcional)</label>
                    <input type="text" value={cliTelefono} onChange={(e) => setCliTelefono(e.target.value)} placeholder="Ej: 2392692177" style={{ width: '100%', padding: '10px', borderRadius: '8px', backgroundColor: '#09090b', border: '1px solid #27272a', color: '#fff', outline: 'none' }} />
                  </div>
                  <div style={{ gridColumn: '1 / -1' }}>
                    <label style={{ display: 'block', fontSize: '0.85rem', color: '#a1a1aa', marginBottom: '5px' }}>Dirección de Entrega *</label>
                    <input type="text" required value={cliDireccion} onChange={(e) => setCliDireccion(e.target.value)} placeholder="Ej: Rivadavia 450" style={{ width: '100%', padding: '10px', borderRadius: '8px', backgroundColor: '#09090b', border: '1px solid #27272a', color: '#fff', outline: 'none' }} />
                  </div>
                </div>

                {/* Turno y Método de Pago */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '15px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.85rem', color: '#a1a1aa', marginBottom: '5px' }}>Turno de Envío</label>
                    <select value={turnoElegido} onChange={(e) => setTurnoElegido(e.target.value)} style={{ width: '100%', padding: '10px', borderRadius: '8px', backgroundColor: '#09090b', border: '1px solid #27272a', color: '#fff', outline: 'none' }}>
                      <option value="Mañana">☀️ Mañana</option>
                      <option value="Tarde">🌙 Tarde</option>
                      <option value="Full">🚀 Envío Full</option>
                    </select>
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.85rem', color: '#a1a1aa', marginBottom: '5px' }}>Método de Pago</label>
                    <select value={pagoElegido} onChange={(e) => setPagoElegido(e.target.value)} style={{ width: '100%', padding: '10px', borderRadius: '8px', backgroundColor: '#09090b', border: '1px solid #27272a', color: '#fff', outline: 'none' }}>
                      <option value="Efectivo">💵 Efectivo</option>
                      <option value="Transferencia">📱 Transferencia</option>
                    </select>
                  </div>
                </div>

                {/* Buscador y Selección de Productos */}
                <div style={{ borderTop: '1px solid #27272a', paddingTop: '15px' }}>
                  <label style={{ display: 'block', fontSize: '0.95rem', fontWeight: 'bold', color: '#f4f4f5', marginBottom: '10px' }}>Seleccionar Productos</label>
                  <input type="text" placeholder="🔍 Buscar producto en stock..." value={busqProducto} onChange={(e) => setBusqProducto(e.target.value)} style={{ width: '100%', padding: '10px', borderRadius: '8px', backgroundColor: '#09090b', border: '1px solid #27272a', color: '#fff', marginBottom: '10px', outline: 'none' }} />
                  
                  {/* Lista desplegable de productos filtrados */}
                  <div style={{ maxHeight: '180px', overflowY: 'auto', border: '1px solid #27272a', borderRadius: '8px', backgroundColor: '#09090b', marginBottom: '15px' }}>
                    {productosFiltradosModal.map(p => (
                      <div key={p.id_producto} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', borderBottom: '1px solid #18181b' }}>
                        <div>
                          <span style={{ color: '#f4f4f5', fontSize: '0.9rem' }}>{p.nombre}</span>
                          <span style={{ color: '#10b981', fontSize: '0.8rem', marginLeft: '10px' }}>${p.precio} (Stock: {p.stock_fisico})</span>
                        </div>
                        <button type="button" onClick={() => agregarAlCarrito(p)} style={{ backgroundColor: '#2563eb', color: '#fff', border: 'none', padding: '4px 10px', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 'bold' }}>
                          + Agregar
                        </button>
                      </div>
                    ))}
                  </div>

                  {/* Carrito Actual */}
                  <label style={{ display: 'block', fontSize: '0.9rem', fontWeight: 'bold', color: '#f4f4f5', marginBottom: '8px' }}>Ítems en el Pedido:</label>
                  {carrito.length === 0 ? (
                    <p style={{ color: '#71717a', fontSize: '0.85rem', margin: 0 }}>No hay productos agregados todavía.</p>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '150px', overflowY: 'auto' }}>
                      {carrito.map(item => (
                        <div key={item.id_producto} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#18181b', padding: '8px 12px', borderRadius: '8px', border: '1px solid #27272a' }}>
                          <span style={{ fontSize: '0.9rem', color: '#e4e4e7' }}>{item.nombre} (${item.precio} c/u)</span>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <button type="button" onClick={() => cambiarCantidadCarrito(item.id_producto, -1)} style={{ backgroundColor: '#27272a', color: '#fff', border: 'none', width: '24px', height: '24px', borderRadius: '4px', cursor: 'pointer' }}>-</button>
                            <span style={{ fontWeight: 'bold', fontSize: '0.9rem' }}>{item.cantidad}</span>
                            <button type="button" onClick={() => cambiarCantidadCarrito(item.id_producto, 1)} style={{ backgroundColor: '#27272a', color: '#fff', border: 'none', width: '24px', height: '24px', borderRadius: '4px', cursor: 'pointer' }}>+</button>
                            <span style={{ fontWeight: 'bold', color: '#10b981', minWidth: '60px', textAlign: 'right' }}>${item.precio * item.cantidad}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Total y Botón de Guardar */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #27272a', paddingTop: '15px', marginTop: '5px' }}>
                  <span style={{ fontSize: '1.2rem', fontWeight: 'bold', color: '#f4f4f5' }}>Total: <span style={{ color: '#10b981' }}>${totalCarrito}</span></span>
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <button type="button" onClick={reiniciarModal} style={{ backgroundColor: 'transparent', color: '#a1a1aa', border: '1px solid #3f3f46', padding: '10px 16px', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer' }}>
                      Cancelar
                    </button>
                    <button type="submit" disabled={guardandoPedido} style={{ backgroundColor: '#10b981', color: '#fff', border: 'none', padding: '10px 20px', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer' }}>
                      {guardandoPedido ? 'Guardando y Descontando Stock...' : 'Confirmar y Guardar Pedido'}
                    </button>
                  </div>
                </div>

              </form>
            )}

          </div>
        </div>
      )}

      {pedidosSeleccionados.length > 0 && (
        <div style={{ position: 'fixed', bottom: '20px', backgroundColor: '#18181b', border: '1px solid #3f3f46', padding: '15px 25px', borderRadius: '12px', boxShadow: '0 10px 25px rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', gap: '20px', zIndex: 1100, flexWrap: 'wrap', maxWidth: '90%' }}>
          <span style={{ fontWeight: 'bold', fontSize: '0.95rem', color: '#f4f4f5' }}>📦 {pedidosSeleccionados.length} seleccionados</span>
          <select value={estadoMasivo} onChange={(e) => setEstadoMasivo(e.target.value)} style={{ padding: '0.5rem 0.75rem', borderRadius: '8px', border: '1px solid #3f3f46', backgroundColor: '#09090b', color: '#f4f4f5', fontSize: '0.9rem', fontWeight: '500', outline: 'none' }}>
            <option value="Pendiente">Pendiente</option>
            <option value="En Preparación">⚙️ En Preparación</option>
            <option value="En Reparto">🛵 En Reparto</option>
            <option value="Entregado">Entregado</option>
            <option value="Cancelado">Cancelado</option>
          </select>
          <button onClick={cambiarEstadoMasivo} style={{ backgroundColor: '#4f46e5', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', fontSize: '0.9rem' }}>
            Aplicar Estado Masivo
          </button>
          <button onClick={() => setPedidosSeleccionados([])} style={{ backgroundColor: 'transparent', color: '#a1a1aa', border: 'none', cursor: 'pointer', fontSize: '0.9rem', fontWeight: 'bold' }}>
            Limpiar selección
          </button>
        </div>
      )}
    </main>
  );
}