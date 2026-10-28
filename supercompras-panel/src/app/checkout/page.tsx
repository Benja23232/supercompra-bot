'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import NavbarCheckout from '@/components/NavbarCheckout';
import Footer from '@/components/Footer';

/* Íconos */
const StoreIcon = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg>;
const TruckIcon = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="3" width="15" height="13"></rect><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"></polygon><circle cx="5.5" cy="18.5" r="2.5"></circle><circle cx="18.5" cy="18.5" r="2.5"></circle></svg>;
const SunIcon = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>;
const ClockIcon = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>;
const CheckCircleIcon = () => <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#115B32" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>;
const TrashIcon = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>;

export default function CheckoutPage() {
  const router = useRouter();
  
  const [carrito, setCarrito] = useState<any[]>([]);
  const [cargando, setCargando] = useState(true);

  // Formulario de Cliente
  const [nombre, setNombre] = useState('');
  const [telefono, setTelefono] = useState('');
  // 4 opciones de entrega
  const [entrega, setEntrega] = useState<'retiro' | 'envio_full' | 'envio_manana' | 'envio_tarde'>('retiro');
  const [direccion, setDireccion] = useState('');
  
  const [enviando, setEnviando] = useState(false);
  const [pedidoExitoso, setPedidoExitoso] = useState<string | null>(null);

  useEffect(() => {
    // 1. Cargar el carrito
    const carritoGuardado = localStorage.getItem('supercompras_carrito');
    if (carritoGuardado) {
      setCarrito(JSON.parse(carritoGuardado));
    }
    
    // 2. Autocompletar datos si el usuario ya está logueado
    const userGuardado = localStorage.getItem('supercompras_user');
    if (userGuardado) {
      const user = JSON.parse(userGuardado);
      if (user.nombre) setNombre(user.nombre);
      if (user.whatsapp_id) setTelefono(user.whatsapp_id);
    }
    
    setCargando(false);
  }, []);

  // Guardar en localStorage cada vez que se edita el carrito
  useEffect(() => {
    if (!cargando) {
      localStorage.setItem('supercompras_carrito', JSON.stringify(carrito));
    }
  }, [carrito, cargando]);

  // --- LÓGICA DE PRECIOS Y COSTOS DE ENVÍO ---
  const subtotal = carrito.reduce((acc, item) => acc + (item.precio * item.cantidad), 0);
  
  let costoEnvio = 0;
  if (entrega === 'envio_full') {
    costoEnvio = 1500;
  }
  
  const total = subtotal + costoEnvio;

  // --- CONTROLES DEL CARRITO ---
  const actualizarCantidad = (id_producto: string, delta: number) => {
    setCarrito(prev => prev.map(item => {
      if (item.id_producto === id_producto) {
        return { ...item, cantidad: item.cantidad + delta };
      }
      return item;
    }).filter(item => item.cantidad > 0));
  };

  const eliminarProducto = (id_producto: string) => {
    setCarrito(prev => prev.filter(item => item.id_producto !== id_producto));
  };

  // --- PROCESAR COMPRA ---
  const procesarPedido = async (e: React.FormEvent) => {
    e.preventDefault();
    if (carrito.length === 0) return alert("Tu carrito está vacío.");
    if (!telefono || !nombre) return alert("Por favor completá tu nombre y WhatsApp.");
    if (entrega !== 'retiro' && !direccion) return alert("Por favor ingresá tu dirección para el envío.");

    setEnviando(true);
    try {
      let telLimpio = telefono.replace(/[^0-9]/g, '');
      if (!telLimpio.startsWith('549')) telLimpio = `549${telLimpio}`;

      await supabase.from('clientes').upsert({ whatsapp_id: telLimpio, nombre: nombre }, { onConflict: 'whatsapp_id' });

      const estadoReal = entrega === 'retiro' ? 'Pendiente - Retiro' : 'Pendiente - Domicilio';
      
      // Armamos la etiqueta para tu panel de control
      let etiquetaTurno = '';
      if (entrega === 'envio_full') etiquetaTurno = ' (Envío Full)';
      if (entrega === 'envio_manana') etiquetaTurno = ' (Turno Mañana)';
      if (entrega === 'envio_tarde') etiquetaTurno = ' (Turno Tarde)';
      
      const dirReal = entrega === 'retiro' ? 'Retiro en depósito (Mitre 1044)' : `${direccion}${etiquetaTurno}`;

      const { data: ped, error: errPed } = await supabase
        .from('pedidos')
        .insert({
          whatsapp_id: telLimpio,
          estado: estadoReal,
          total_compra: total,
          direccion: dirReal
        })
        .select('id_pedido')
        .single();

      if (errPed || !ped) throw new Error("Error creando el pedido");

      const detalles = carrito.map(item => ({
        id_pedido: ped.id_pedido,
        id_producto: item.id_producto,
        cantidad: item.cantidad,
        precio_congelado: item.precio
      }));

      await supabase.from('detalle_pedidos').insert(detalles);

      localStorage.removeItem('supercompras_carrito');
      setCarrito([]);

      setPedidoExitoso(ped.id_pedido);
      setEnviando(false);

    } catch (error) {
      console.error(error);
      alert("Hubo un error al procesar tu pedido. Intentá de nuevo.");
      setEnviando(false);
    }
  };

  if (cargando) return <div style={{ padding: '50px', textAlign: 'center', fontFamily: 'Nunito' }}>Cargando checkout...</div>;

  return (
    <div className="ck-layout">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800;900&display=swap');
        
        .ck-layout { font-family: 'Nunito', sans-serif; background-color: #F8FAFC; min-height: 100vh; color: #1E293B; display: flex; flex-direction: column; }
        .ck-container { max-width: 1200px; margin: 0 auto; padding: 40px 20px; display: grid; grid-template-columns: 1.2fr 1fr; gap: 40px; align-items: start; flex-grow: 1; width: 100%; }
        
        /* Panel Izquierdo: Resumen */
        .ck-panel { background: #FFFFFF; border-radius: 24px; padding: 32px; box-shadow: 0 10px 30px rgba(0,0,0,0.03); border: 1px solid #F1F5F9; }
        .ck-title { font-size: 1.8rem; font-weight: 900; margin: 0 0 24px; letter-spacing: -0.5px; }
        
        .ck-items-list { display: flex; flex-direction: column; gap: 16px; margin-bottom: 24px; max-height: 450px; overflow-y: auto; padding-right: 10px; }
        .ck-item { display: flex; align-items: center; gap: 16px; padding-bottom: 16px; border-bottom: 1px solid #F1F5F9; flex-wrap: wrap; }
        .ck-item-img { width: 64px; height: 64px; object-fit: contain; background: #F8FAFC; border-radius: 12px; padding: 6px; }
        .ck-item-info { flex-grow: 1; min-width: 150px; }
        .ck-item-name { margin: 0; font-size: 1rem; font-weight: 800; color: #334155; }
        .ck-item-price { font-size: 1.15rem; font-weight: 900; color: #115B32; margin-top: 4px; }
        
        /* Controles de edición de carrito */
        .ck-item-actions { display: flex; align-items: center; gap: 12px; }
        .ck-qty-ctrl { display: flex; align-items: center; background: #F8FAFC; border-radius: 10px; border: 1px solid #E2E8F0; overflow: hidden; }
        .ck-qty-btn { width: 34px; height: 34px; border: none; background: transparent; color: #115B32; font-size: 1.2rem; font-weight: 900; cursor: pointer; transition: background 0.2s; }
        .ck-qty-btn:hover { background: #E2E8F0; }
        .ck-qty-val { width: 34px; text-align: center; font-weight: 800; font-size: 0.95rem; color: #1E293B; }
        .ck-del-btn { width: 34px; height: 34px; display: flex; align-items: center; justify-content: center; border: none; background: #FEE2E2; color: #B91C1C; border-radius: 10px; cursor: pointer; transition: background 0.2s; }
        .ck-del-btn:hover { background: #FECACA; }

        /* Filas de Totales y Desglose */
        .ck-summary-row { display: flex; justify-content: space-between; align-items: center; padding-bottom: 12px; }
        .ck-summary-label { font-size: 1.1rem; font-weight: 800; color: #64748B; }
        .ck-summary-val { font-size: 1.2rem; font-weight: 800; color: #1E293B; }
        
        .ck-total-row { display: flex; justify-content: space-between; align-items: center; padding-top: 16px; border-top: 2px dashed #E2E8F0; }
        .ck-total-label { font-size: 1.3rem; font-weight: 800; color: #64748B; }
        .ck-total-val { font-size: 2rem; font-weight: 900; color: #C9922B; }

        /* Panel Derecho: Formulario */
        .ck-form { display: flex; flex-direction: column; gap: 20px; }
        .ck-form-group { display: flex; flex-direction: column; gap: 8px; }
        .ck-label { font-size: 0.9rem; font-weight: 800; color: #475569; }
        .ck-input { width: 100%; padding: 14px 18px; border: 2px solid #E2E8F0; border-radius: 14px; font-size: 1rem; font-weight: 600; color: #1E293B; background: #F8FAFC; outline: none; transition: all 0.2s; }
        .ck-input:focus { border-color: #115B32; background: #FFFFFF; box-shadow: 0 0 0 4px rgba(17, 91, 50, 0.1); }
        
        .ck-options { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
        .ck-opt-btn { display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; gap: 8px; padding: 16px 10px; border: 2px solid #E2E8F0; border-radius: 16px; background: #FFFFFF; cursor: pointer; transition: all 0.2s; color: #64748B; font-weight: 800; font-size: 0.9rem; line-height: 1.2; }
        .ck-opt-btn.active { border-color: #115B32; background: #E8F5E9; color: #115B32; }
        .ck-opt-btn:hover:not(.active) { border-color: #CBD5E1; }
        .ck-opt-price { display: block; font-size: 0.8rem; opacity: 0.8; margin-top: 4px; }

        .ck-submit { margin-top: 10px; width: 100%; padding: 18px; background: #C9922B; color: #FFFFFF; font-size: 1.15rem; font-weight: 900; border: none; border-radius: 16px; cursor: pointer; transition: transform 0.2s, background 0.2s; box-shadow: 0 8px 20px rgba(201, 146, 43, 0.3); }
        .ck-submit:hover:not(:disabled) { transform: translateY(-2px); background: #B07D1E; }
        .ck-submit:disabled { background: #CBD5E1; cursor: not-allowed; box-shadow: none; }
        
        .ck-empty { text-align: center; padding: 60px 20px; }
        .ck-empty-btn { display: inline-block; margin-top: 20px; padding: 12px 24px; background: #115B32; color: #fff; text-decoration: none; border-radius: 12px; font-weight: 800; border: none; cursor: pointer; }

        /* Pantalla de Éxito */
        .ck-success { display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; padding: 60px 20px; grid-column: 1 / -1; max-width: 600px; margin: 0 auto; }
        .ck-success-title { font-size: 2.2rem; font-weight: 900; color: #1E293B; margin: 24px 0 12px; }
        .ck-success-p { font-size: 1.1rem; color: #64748B; font-weight: 600; line-height: 1.5; margin-bottom: 24px; }
        .ck-success-order { display: inline-block; background: #F8FAFC; border: 2px dashed #CBD5E1; padding: 12px 24px; border-radius: 12px; font-size: 1.4rem; font-weight: 900; color: #115B32; margin-bottom: 30px; }

        @media (max-width: 900px) {
          .ck-container { grid-template-columns: 1fr; padding: 20px; }
          .ck-panel { padding: 24px; }
          .ck-item { justify-content: space-between; }
          .ck-item-info { width: 100%; }
        }
      `}</style>

      <NavbarCheckout />

      <div className="ck-container">
        
        {/* PANTALLA DE ÉXITO */}
        {pedidoExitoso ? (
          <div className="ck-panel ck-success">
            <CheckCircleIcon />
            <h2 className="ck-success-title">¡Pedido Confirmado!</h2>
            <p className="ck-success-p">Ya recibimos tu orden en el sistema y la estamos preparando. Podés pasar a retirarla o te la enviamos según lo que elegiste.</p>
            <div className="ck-success-order">Orden #{pedidoExitoso}</div>
            <button onClick={() => router.push('/')} className="ck-empty-btn" style={{ width: '100%', maxWidth: '300px' }}>
              Volver a la tienda
            </button>
          </div>
        ) : carrito.length === 0 ? (
          
          /* CARRITO VACÍO */
          <div className="ck-panel ck-empty" style={{ gridColumn: '1 / -1' }}>
            <h2>🛒 Tu carrito está vacío</h2>
            <p>Parece que todavía no sumaste productos a tu compra.</p>
            <button onClick={() => router.push('/')} className="ck-empty-btn">Empezar a comprar</button>
          </div>

        ) : (
          <>
            {/* IZQUIERDA: RESUMEN DEL CARRITO */}
            <div className="ck-panel">
              <h2 className="ck-title">Resumen de tu compra</h2>
              <div className="ck-items-list">
                {carrito.map(item => (
                  <div key={item.id_producto} className="ck-item">
                    <img src={item.image_url || '/placeholder-producto.jpg'} alt={item.nombre} className="ck-item-img" />
                    
                    <div className="ck-item-info">
                      <h3 className="ck-item-name">{item.nombre}</h3>
                      <div className="ck-item-price">${item.precio * item.cantidad}</div>
                    </div>

                    {/* Controles de Cantidad y Eliminación */}
                    <div className="ck-item-actions">
                      <div className="ck-qty-ctrl">
                        <button type="button" className="ck-qty-btn" onClick={() => actualizarCantidad(item.id_producto, -1)}>−</button>
                        <span className="ck-qty-val">{item.cantidad}</span>
                        <button type="button" className="ck-qty-btn" onClick={() => actualizarCantidad(item.id_producto, 1)}>+</button>
                      </div>
                      <button type="button" className="ck-del-btn" onClick={() => eliminarProducto(item.id_producto)} title="Eliminar">
                        <TrashIcon />
                      </button>
                    </div>

                  </div>
                ))}
              </div>
              
              {/* Desglose de totales */}
              <div className="ck-summary-row">
                <span className="ck-summary-label">Subtotal de productos:</span>
                <span className="ck-summary-val">${subtotal}</span>
              </div>
              <div className="ck-summary-row">
                <span className="ck-summary-label">Costo de envío:</span>
                <span className="ck-summary-val">{costoEnvio > 0 ? `$${costoEnvio}` : 'Gratis'}</span>
              </div>

              <div className="ck-total-row">
                <span className="ck-total-label">Total a pagar:</span>
                <span className="ck-total-val">${total}</span>
              </div>
            </div>

            {/* DERECHA: FORMULARIO Y CONFIRMACIÓN */}
            <div className="ck-panel">
              <h2 className="ck-title">Tus Datos</h2>
              <form onSubmit={procesarPedido} className="ck-form">
                
                <div className="ck-form-group">
                  <label className="ck-label">Nombre y Apellido</label>
                  <input type="text" className="ck-input" required value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Ej: Juan Pérez" />
                </div>

                <div className="ck-form-group">
                  <label className="ck-label">WhatsApp</label>
                  <input type="tel" className="ck-input" required value={telefono} onChange={e => setTelefono(e.target.value)} placeholder="Ej: 2392 123456" />
                </div>

                <div className="ck-form-group" style={{ marginTop: '10px' }}>
                  <label className="ck-label">¿Cómo lo querés recibir?</label>
                  <div className="ck-options">
                    <button type="button" className={`ck-opt-btn ${entrega === 'retiro' ? 'active' : ''}`} onClick={() => setEntrega('retiro')}>
                      <StoreIcon /> Retiro por el Local
                      <span className="ck-opt-price">Gratis</span>
                    </button>
                    
                    <button type="button" className={`ck-opt-btn ${entrega === 'envio_full' ? 'active' : ''}`} onClick={() => setEntrega('envio_full')}>
                      <TruckIcon /> Envío Full
                      <span className="ck-opt-price">+$1500</span>
                    </button>

                    <button type="button" className={`ck-opt-btn ${entrega === 'envio_manana' ? 'active' : ''}`} onClick={() => setEntrega('envio_manana')}>
                      <SunIcon /> Envío Turno Mañana
                      <span className="ck-opt-price">Gratis</span>
                    </button>

                    <button type="button" className={`ck-opt-btn ${entrega === 'envio_tarde' ? 'active' : ''}`} onClick={() => setEntrega('envio_tarde')}>
                      <ClockIcon /> Envío Turno Tarde
                      <span className="ck-opt-price">Gratis</span>
                    </button>
                  </div>
                </div>

                {entrega !== 'retiro' && (
                  <div className="ck-form-group">
                    <label className="ck-label">Dirección de entrega</label>
                    <input type="text" className="ck-input" required value={direccion} onChange={e => setDireccion(e.target.value)} placeholder="Ej: San Martín 450" />
                  </div>
                )}

                <button type="submit" className="ck-submit" disabled={enviando}>
                  {enviando ? 'Procesando...' : `Confirmar y Pagar $${total}`}
                </button>
              </form>
            </div>
          </>
        )}
      </div>
      <Footer />
    </div>
  );
}