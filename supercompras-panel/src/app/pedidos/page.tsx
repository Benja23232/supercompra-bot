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
  const [turnoElegido, setTurnoElegido] = useState('Mañana');
  const [pagoElegido, setPagoElegido] = useState('Efectivo');
  const [carrito, setCarrito] = useState<any[]>([]);
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
      let telefonoLimpio = cliTelefono.trim() || `manual_${Date.now()}`;

      await supabase
        .from('clientes')
        .upsert({ whatsapp_id: telefonoLimpio, nombre: cliNombre.trim() }, { onConflict: 'whatsapp_id' });

      const estadoInicial = `Pendiente - ${turnoElegido}`;

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

      const { error: pagoError } = await supabase
        .from('pagos')
        .insert([{
          id_pedido: idNuevoPedido,
          metodo: pagoElegido,
          monto: totalCarrito,
          estado: pagoElegido === 'Transferencia' ? 'Pendiente' : 'Completado',
          fecha_pago: new Date().toISOString()
        }]);

      if (pagoError) console.error("Error al registrar el pago:", JSON.stringify(pagoError));

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
        await supabase
          .from('productos')
          .update({ stock_fisico: nuevoStock })
          .eq('id_producto', item.id_producto);
      }

      await logAuditoria('Pedidos', 'Creación manual', `Creó manualmente el pedido #${String(idNuevoPedido).slice(0, 8)} para ${cliNombre} por $${totalCarrito}`);

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
      console.error("Error detallado al crear pedido:", err);
      alert(`Hubo un error al registrar el pedido.`);
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

  const pedidosPorTurno = pedidos.filter((pedido) => {
    if (filtro === 'todos') return true;
    if (filtro === 'full') return pedido.estado?.includes('Full');
    if (filtro === 'manana') return pedido.estado?.includes('Mañana');
    if (filtro === 'tarde') return pedido.estado?.includes('Tarde');
    return true;
  });

  const pedidosPendientes = pedidosPorTurno.filter(p => !p.estado || p.estado.includes('Pendiente'));
  const pedidosEnProceso = pedidosPorTurno.filter(p => p.estado?.includes('En Preparación') || p.estado?.includes('En Preparacion') || p.estado?.includes('En Proceso') || p.estado?.includes('Armado'));
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

    const { error } = await supabase.from('pedidos').update({ estado: estadoFinal }).eq('id_pedido', id);
    if (!error) {
      await logAuditoria('Pedidos', 'Cambio de estado', `Actualizó estado del pedido #${String(id).slice(0, 8)} a "${estadoFinal}"`);
      fetchPedidos(); 
    }
  };

  const cambiarEstadoMasivo = async () => {
    if (pedidosSeleccionados.length === 0) return;
    const { error } = await supabase.from('pedidos').update({ estado: estadoMasivo }).in('id_pedido', pedidosSeleccionados);
    if (!error) {
      setPedidosSeleccionados([]);
      fetchPedidos();
    }
  };

  const toggleSeleccionPedido = (id: any) => {
    if (pedidosSeleccionados.includes(id)) setPedidosSeleccionados(pedidosSeleccionados.filter(item => item !== id));
    else setPedidosSeleccionados([...pedidosSeleccionados, id]);
  };

  const seleccionarTodosVisibles = () => {
    const idsVisibles = [...pedidosPendientes, ...pedidosEnProceso, ...pedidosEnReparto, ...pedidosFinalizados].map(p => p.id_pedido);
    if (pedidosSeleccionados.length === idsVisibles.length) setPedidosSeleccionados([]);
    else setPedidosSeleccionados(idsVisibles);
  };

  // --- FUNCIONES RESTAURADAS ---
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
    const fecha = new Date(fechaIso.endsWith('Z') || fechaIso.includes('+') ? fechaIso : fechaIso + 'Z');
    return fecha.toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/Argentina/Buenos_Aires' });
  };

  if (!autorizado) return <main style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', backgroundColor: '#0a0a0a', color: '#9ca3af' }}><p>Verificando acceso...</p></main>;

  const renderSeccionPedidos = (lista: any[], tituloSecc: string, descripcion: string) => {
    if (lista.length === 0) {
      return (
        <div className="tarjeta-vacia">
          <span className="icono-vacio">{tituloSecc.includes('Espera') ? '⏳' : tituloSecc.includes('Armado') ? '⚙️' : tituloSecc.includes('Reparto') ? '🛵' : '✅'}</span>
          <h2>{tituloSecc} (0)</h2>
          <p>{descripcion}</p>
        </div>
      );
    }

    return (
      <div className="seccion-pedidos">
        <h2>{tituloSecc} ({lista.length})</h2>
        <p className="descripcion-seccion">{descripcion}</p>
        
        <div className="grilla-pedidos">
          {lista.map((pedido) => {
            const estadoActual = pedido.estado || 'Pendiente';
            const estaSeleccionado = pedidosSeleccionados.includes(pedido.id_pedido);

            let valorSelect = estadoActual;
            if (estadoActual.includes('En Preparación') || estadoActual.includes('En Proceso')) valorSelect = 'En Preparación';
            else if (estadoActual.includes('Armado')) valorSelect = 'Armado';
            else if (estadoActual.includes('En Reparto')) valorSelect = 'En Reparto';
            else if (estadoActual.includes('Entregado')) valorSelect = 'Entregado';
            else if (estadoActual.includes('Cancelado')) valorSelect = 'Cancelado';
            else if (estadoActual.includes('Pendiente')) valorSelect = 'Pendiente';

            return (
              <div key={pedido.id_pedido} className={`tarjeta-pedido ${estaSeleccionado ? 'seleccionado' : ''}`}>
                <div className="header-pedido">
                  <div className="id-pedido">
                    <input type="checkbox" checked={estaSeleccionado} onChange={() => toggleSeleccionPedido(pedido.id_pedido)} />
                    <span>#{String(pedido.id_pedido).slice(0, 8)}...</span>
                  </div>
                  <span className="total-pedido">${pedido.total_compra || 0}</span>
                </div>

                <div className="info-cliente">
                  <div>👤 <strong>{pedido.nombre_cliente || pedido.whatsapp_id || 'Cliente'}</strong></div>
                  <div className="fecha-pedido">📅 {formatearFecha(pedido.fecha_creacion)}</div>
                </div>

                <div className="direccion-box">
                  <div className="texto-direccion">
                    📍 <strong>Dirección:</strong> {pedido.direccion ? pedido.direccion : <span className="error">No especificada</span>}
                  </div>
                  {pedido.direccion && (
                    <button onClick={() => abrirDireccionIndividual(pedido.direccion)} className="btn-mapa">
                      🗺️ Mapa
                    </button>
                  )}
                </div>

                <div className="selector-estado">
                  <label>Estado y Logística:</label>
                  <select value={valorSelect} onChange={(e) => cambiarEstado(pedido.id_pedido, e.target.value, estadoActual)}>
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

                <div className="botones-accion">
                  <Link href={`/pedidos/${pedido.id_pedido}`} className="btn-detalle">👁️ Ver Detalle</Link>
                  <Link href={`/pedidos/${pedido.id_pedido}/armar`} className="btn-armar">📦 Armar</Link>
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
    <main className="layout-principal">
      <style>{`
        /* --- ESTILOS RESPONSIVOS GLOBALES --- */
        .layout-principal { padding: 20px; background-color: #0a0a0a; min-height: 100vh; color: #f4f4f5; font-family: sans-serif; box-sizing: border-box; display: flex; flex-direction: column; align-items: center; padding-bottom: ${pedidosSeleccionados.length > 0 ? '100px' : '20px'}; }
        .contenedor-max { width: 100%; max-width: 1400px; }
        
        .header-top { display: flex; justify-content: space-between; width: 100%; margin-bottom: 20px; }
        .titulo-seccion { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 15px; margin-bottom: 25px; width: 100%; }
        .titulo-texto { margin: 0; font-size: 1.8rem; color: #f4f4f5; }
        
        .grupo-botones { display: flex; gap: 10px; flex-wrap: wrap; }
        .btn { border: none; padding: 10px 18px; border-radius: 8px; font-weight: bold; cursor: pointer; font-size: 0.9rem; display: flex; align-items: center; gap: 5px; justify-content: center; }
        .btn-verde { background-color: #10b981; color: #fff; }
        .btn-oscuro { background-color: #27272a; color: #f4f4f5; border: 1px solid #3f3f46; }
        
        .filtros-box { background-color: #121214; padding: 20px; border-radius: 12px; margin-bottom: 35px; border: 1px solid #27272a; width: 100%; box-sizing: border-box; }
        .botones-filtro { display: flex; gap: 10px; flex-wrap: wrap; }
        .btn-filtro { flex: 1; min-width: 120px; padding: 10px; border-radius: 8px; border: 1px solid #27272a; font-weight: bold; font-size: 0.9rem; color: white; cursor: pointer; text-align: center; }
        
        .tarjeta-vacia { margin-bottom: 30px; padding: 30px; background-color: #121214; border-radius: 12px; border: 1px solid #27272a; text-align: center; }
        .icono-vacio { font-size: 2.5rem; display: block; margin-bottom: 10px; }
        .tarjeta-vacia h2 { font-size: 1.3rem; margin: 0 0 5px 0; color: #f4f4f5; }
        .tarjeta-vacia p { color: #a1a1aa; margin: 0; font-size: 0.9rem; }
        
        .seccion-pedidos { margin-bottom: 40px; width: 100%; }
        .seccion-pedidos h2 { font-size: 1.3rem; margin: 0 0 5px 0; color: #f4f4f5; }
        .descripcion-seccion { color: #a1a1aa; margin-bottom: 15px; margin-top: 0; font-size: 0.9rem; }
        .grilla-pedidos { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 20px; width: 100%; }
        
        .tarjeta-pedido { background-color: #121214; border: 1px solid #27272a; border-radius: 12px; padding: 20px; box-shadow: 0 4px 6px rgba(0,0,0,0.4); display: flex; flex-direction: column; gap: 14px; position: relative; }
        .tarjeta-pedido.seleccionado { border: 2px solid #6366f1; }
        
        .header-pedido { display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #27272a; padding-bottom: 10px; }
        .id-pedido { display: flex; align-items: center; gap: 8px; font-weight: bold; font-size: 1.1rem; color: #f4f4f5; }
        .id-pedido input { width: 18px; height: 18px; cursor: pointer; accent-color: #4f46e5; }
        .total-pedido { font-weight: bold; font-size: 1.2rem; color: #10b981; }
        
        .info-cliente { display: flex; flex-direction: column; gap: 5px; font-size: 1.05rem; color: #f4f4f5; }
        .fecha-pedido { font-size: 0.85rem; color: #a1a1aa; display: flex; align-items: center; gap: 5px; }
        
        .direccion-box { background-color: #09090b; padding: 10px 12px; border-radius: 8px; border: 1px solid #27272a; display: flex; justify-content: space-between; align-items: center; gap: 8px; }
        .texto-direccion { font-size: 0.9rem; color: #e4e4e7; overflow: hidden; text-overflow: ellipsis; }
        .error { color: #f87171; }
        .btn-mapa { background: #16a34a; color: #fff; border: none; border-radius: 6px; padding: 6px 10px; cursor: pointer; font-size: 0.8rem; font-weight: bold; white-space: nowrap; }
        
        .selector-estado label { display: block; font-size: 0.85rem; color: #a1a1aa; margin-bottom: 6px; }
        .selector-estado select { width: 100%; padding: 0.6rem 0.75rem; border-radius: 8px; border: 1px solid #27272a; cursor: pointer; background-color: #09090b; color: #f4f4f5; font-size: 0.9rem; font-weight: 500; outline: none; }
        
        .botones-accion { display: flex; gap: 10px; margin-top: 4px; }
        .btn-detalle, .btn-armar { flex: 1; text-align: center; padding: 10px 8px; border-radius: 8px; text-decoration: none; font-weight: bold; font-size: 0.85rem; }
        .btn-detalle { background-color: #27272a; color: #f4f4f5; }
        .btn-armar { background-color: #2563eb; color: #fff; }

        /* MODAL */
        .modal-overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background-color: rgba(0,0,0,0.8); display: flex; justify-content: center; align-items: center; z-index: 2000; padding: 20px; box-sizing: border-box; }
        .modal-content { background-color: #121214; border: 1px solid #27272a; border-radius: 16px; width: 100%; max-width: 900px; max-height: 90vh; overflow-y: auto; padding: 30px; box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.7); }
        .modal-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 15px; }
        .modal-grid-peq { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 15px; }
        .input-dark { width: 100%; padding: 10px; border-radius: 8px; background-color: #09090b; border: 1px solid #27272a; color: #fff; outline: none; box-sizing: border-box; }
        .label-dark { display: block; font-size: 0.85rem; color: #a1a1aa; margin-bottom: 5px; }
        .barra-flotante { position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%); background-color: #18181b; border: 1px solid #3f3f46; padding: 15px 25px; border-radius: 12px; box-shadow: 0 10px 25px rgba(0,0,0,0.6); display: flex; align-items: center; gap: 20px; z-index: 1100; flex-wrap: wrap; width: 90%; max-width: 800px; justify-content: center; }

        /* RESPONSIVE PARA CELULARES */
        @media (max-width: 600px) {
          .titulo-seccion { flex-direction: column; align-items: stretch; text-align: center; }
          .grupo-botones { flex-direction: column; width: 100%; }
          .btn { width: 100%; }
          .botones-filtro { flex-direction: column; }
          .btn-filtro { width: 100%; }
          .modal-content { padding: 15px; }
          .botones-accion { flex-direction: column; }
          .barra-flotante { flex-direction: column; gap: 10px; padding: 15px; }
          .barra-flotante select, .barra-flotante button { width: 100%; }
          .direccion-box { flex-direction: column; align-items: flex-start; }
          .btn-mapa { width: 100%; margin-top: 5px; text-align: center; }
        }
      `}</style>

      <div className="contenedor-max">
        {alertaNuevoPedido && (
          <div style={{ position: 'fixed', top: '20px', right: '20px', backgroundColor: '#10b981', color: '#fff', padding: '15px 25px', borderRadius: '8px', zIndex: 1000, fontWeight: 'bold' }}>
            🔔 ¡Nuevo pedido ingresado!
          </div>
        )}

        <div className="header-top">
          {rolActivo === 'admin' ? (
            <Link href="/dashboard" style={{ color: '#818cf8', textDecoration: 'none', fontWeight: 'bold' }}>🔙 Volver al panel</Link>
          ) : (
            <button onClick={cerrarSesion} style={{ background: 'none', border: 'none', color: '#ef4444', fontWeight: 'bold', cursor: 'pointer' }}>🔒 Cerrar Sesión</button>
          )}
        </div>

        <div className="titulo-seccion">
          <h1 className="titulo-texto">🛒 Logística y Armado</h1>
          <div className="grupo-botones">
            <button className="btn btn-verde" onClick={() => setModalAbierto(true)}>➕ Pedido Manual</button>
            <button className="btn btn-oscuro" onClick={seleccionarTodosVisibles}>☑️ Seleccionar Todos</button>
            <button className="btn btn-oscuro" onClick={abrirRutaEnMapa}>🗺️ Ruta (Turno Actual)</button>
            <button className="btn btn-oscuro" onClick={fetchPedidos}>🔄 Sincronizar</button>
          </div>
        </div>

        <div className="filtros-box">
          <h2 style={{ fontSize: '1.05rem', margin: '0 0 15px 0' }}>📍 Filtrar por Turno / Envío</h2>
          <div className="botones-filtro">
            <button className="btn-filtro" style={{ backgroundColor: filtro === 'todos' ? '#4f46e5' : '#18181b' }} onClick={() => setFiltro('todos')}>📋 Todos ({pedidos.length})</button>
            <button className="btn-filtro" style={{ backgroundColor: filtro === 'full' ? '#4f46e5' : '#18181b' }} onClick={() => setFiltro('full')}>🚀 Full ({pedidos.filter(p => p.estado?.includes('Full')).length})</button>
            <button className="btn-filtro" style={{ backgroundColor: filtro === 'manana' ? '#4f46e5' : '#18181b' }} onClick={() => setFiltro('manana')}>☀️ Mañana ({pedidos.filter(p => p.estado?.includes('Mañana')).length})</button>
            <button className="btn-filtro" style={{ backgroundColor: filtro === 'tarde' ? '#4f46e5' : '#18181b' }} onClick={() => setFiltro('tarde')}>🌙 Tarde ({pedidos.filter(p => p.estado?.includes('Tarde')).length})</button>
          </div>
        </div>
        
        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px', color: '#a1a1aa' }}>Cargando ventas...</div>
        ) : (
          <div style={{ width: '100%' }}>
            {renderSeccionPedidos(pedidosPendientes, '⏳ Cola de Espera (Pendientes)', 'Pedidos ingresados esperando que un empleado los busque en las estanterías.')}
            {renderSeccionPedidos(pedidosEnProceso, '⚙️ En Armado / Listos', 'Pedidos que ya pasaron a preparación y están en curso o armados listos para salir.')}
            {renderSeccionPedidos(pedidosEnReparto, '🛵 En Reparto (En Camino)', 'Pedidos que ya salieron con el repartidor hacia el domicilio.')}
            {renderSeccionPedidos(pedidosFinalizados, '📦 Historial Terminado', 'Pedidos ya entregados al cliente o cancelados.')}
          </div>
        )}
      </div>

      {modalAbierto && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '1px solid #27272a', paddingBottom: '15px' }}>
              <h2 style={{ margin: 0, fontSize: '1.4rem' }}>📝 Cargar Nuevo Pedido Manual</h2>
              <button onClick={reiniciarModal} style={{ background: 'none', border: 'none', color: '#a1a1aa', fontSize: '1.2rem', cursor: 'pointer' }}>✕</button>
            </div>

            {ticketGenerado ? (
              <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <div style={{ backgroundColor: '#09090b', padding: '20px', borderRadius: '8px', border: '1px solid #27272a', textAlign: 'left', whiteSpace: 'pre-wrap', fontFamily: 'monospace', color: '#10b981' }}>{ticketGenerado}</div>
                <div className="grupo-botones" style={{ justifyContent: 'center' }}>
                  <button onClick={() => { navigator.clipboard.writeText(ticketGenerado); alert("¡Copiado!"); }} className="btn btn-verde">📋 Copiar Resumen</button>
                  <button onClick={reiniciarModal} className="btn btn-oscuro">Cerrar y Volver</button>
                </div>
              </div>
            ) : (
              <form onSubmit={guardarPedidoManual} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <div className="modal-grid">
                  <div><label className="label-dark">Nombre del Cliente *</label><input type="text" required value={cliNombre} onChange={(e) => setCliNombre(e.target.value)} className="input-dark" /></div>
                  <div><label className="label-dark">Teléfono / WhatsApp</label><input type="text" value={cliTelefono} onChange={(e) => setCliTelefono(e.target.value)} className="input-dark" /></div>
                  <div style={{ gridColumn: '1 / -1' }}><label className="label-dark">Dirección de Entrega *</label><input type="text" required value={cliDireccion} onChange={(e) => setCliDireccion(e.target.value)} className="input-dark" /></div>
                </div>

                <div className="modal-grid-peq">
                  <div>
                    <label className="label-dark">Turno de Envío</label>
                    <select value={turnoElegido} onChange={(e) => setTurnoElegido(e.target.value)} className="input-dark">
                      <option value="Mañana">☀️ Mañana</option><option value="Tarde">🌙 Tarde</option><option value="Full">🚀 Envío Full</option>
                      <option value="Mañana">📦 Retiro en el depósito</option>
                    </select>
                  </div>
                  <div>
                    <label className="label-dark">Método de Pago</label>
                    <select value={pagoElegido} onChange={(e) => setPagoElegido(e.target.value)} className="input-dark">
                      <option value="Efectivo">💵 Efectivo</option><option value="Transferencia">📱 Transferencia</option>
                    </select>
                  </div>
                </div>

                <div style={{ borderTop: '1px solid #27272a', paddingTop: '15px' }}>
                  <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '10px' }}>Seleccionar Productos</label>
                  <input type="text" placeholder="🔍 Buscar producto..." value={busqProducto} onChange={(e) => setBusqProducto(e.target.value)} className="input-dark" style={{ marginBottom: '10px' }} />
                  
                  <div style={{ maxHeight: '150px', overflowY: 'auto', border: '1px solid #27272a', borderRadius: '8px', backgroundColor: '#09090b', marginBottom: '15px' }}>
                    {productosFiltradosModal.map(p => (
                      <div key={p.id_producto} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', borderBottom: '1px solid #18181b' }}>
                        <div>
                          <span style={{ fontSize: '0.9rem' }}>{p.nombre}</span>
                          <span style={{ color: '#10b981', fontSize: '0.8rem', marginLeft: '10px' }}>${p.precio} (Stock: {p.stock_fisico})</span>
                        </div>
                        <button type="button" onClick={() => agregarAlCarrito(p)} style={{ backgroundColor: '#2563eb', color: '#fff', border: 'none', padding: '4px 10px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>+ Añadir</button>
                      </div>
                    ))}
                  </div>

                  <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '8px' }}>Ítems en el Pedido:</label>
                  {carrito.length === 0 ? <p style={{ color: '#71717a', fontSize: '0.85rem' }}>No hay productos.</p> : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '150px', overflowY: 'auto' }}>
                      {carrito.map(item => (
                        <div key={item.id_producto} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#18181b', padding: '8px 12px', borderRadius: '8px', border: '1px solid #27272a' }}>
                          <span style={{ fontSize: '0.9rem' }}>{item.nombre} (${item.precio})</span>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <button type="button" onClick={() => cambiarCantidadCarrito(item.id_producto, -1)} style={{ backgroundColor: '#27272a', color: '#fff', border: 'none', width: '28px', height: '28px', borderRadius: '4px' }}>-</button>
                            <span style={{ fontWeight: 'bold' }}>{item.cantidad}</span>
                            <button type="button" onClick={() => cambiarCantidadCarrito(item.id_producto, 1)} style={{ backgroundColor: '#27272a', color: '#fff', border: 'none', width: '28px', height: '28px', borderRadius: '4px' }}>+</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #27272a', paddingTop: '15px', flexWrap: 'wrap', gap: '10px' }}>
                  <span style={{ fontSize: '1.2rem', fontWeight: 'bold' }}>Total: <span style={{ color: '#10b981' }}>${totalCarrito}</span></span>
                  <div className="grupo-botones">
                    <button type="button" onClick={reiniciarModal} className="btn btn-oscuro">Cancelar</button>
                    <button type="submit" disabled={guardandoPedido} className="btn btn-verde">{guardandoPedido ? 'Guardando...' : 'Confirmar Pedido'}</button>
                  </div>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {pedidosSeleccionados.length > 0 && (
        <div className="barra-flotante">
          <span style={{ fontWeight: 'bold' }}>📦 {pedidosSeleccionados.length} seleccionados</span>
          <select value={estadoMasivo} onChange={(e) => setEstadoMasivo(e.target.value)} style={{ padding: '0.5rem', borderRadius: '8px', backgroundColor: '#09090b', color: '#f4f4f5', border: '1px solid #3f3f46' }}>
            <option value="En Preparación">⚙️ En Preparación</option><option value="En Reparto">🛵 En Reparto</option><option value="Entregado">Entregado</option><option value="Cancelado">Cancelado</option>
          </select>
          <button onClick={cambiarEstadoMasivo} className="btn" style={{ backgroundColor: '#4f46e5', color: '#fff' }}>Aplicar Masivo</button>
          <button onClick={() => setPedidosSeleccionados([])} className="btn btn-oscuro">Limpiar</button>
        </div>
      )}
    </main>
  );
}