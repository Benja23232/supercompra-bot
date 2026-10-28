'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useParams, useRouter } from 'next/navigation';
import NavbarCheckout from '@/components/NavbarCheckout';
import Footer from '@/components/Footer';

const ArrowLeftIcon = () => <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>;
const PackageIcon = () => <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="16.5" y1="9.4" x2="7.5" y2="4.21"></line><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg>;
const MapPinIcon = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>;

export default function DetallePedidoPage() {
  const router = useRouter();
  const params = useParams();
  const idPedido = params.id;

  const [pedido, setPedido] = useState<any>(null);
  const [detalles, setDetalles] = useState<any[]>([]);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    async function fetchDetalle() {
      if (!idPedido) return;

      try {
        // 1. Traer la cabecera del pedido
        const { data: pedData, error: pedError } = await supabase
          .from('pedidos')
          .select('*')
          .eq('id_pedido', idPedido)
          .single();

        if (pedError) throw pedError;
        setPedido(pedData);

        // 2. Traer los ítems comprados
        const { data: itemsData, error: itemsError } = await supabase
          .from('detalle_pedidos')
          .select('*')
          .eq('id_pedido', idPedido);

        if (itemsError) throw itemsError;

        // 3. Traer la info de los productos (fotos y nombres) para armar la lista
        if (itemsData && itemsData.length > 0) {
          const idsProductos = itemsData.map(item => item.id_producto);
          const { data: prodData } = await supabase
            .from('productos')
            .select('id_producto, nombre, image_url')
            .in('id_producto', idsProductos);

          // Unimos los detalles con las fotos y nombres
          const itemsCompletos = itemsData.map(item => {
            const infoProd = prodData?.find(p => p.id_producto === item.id_producto);
            return {
              ...item,
              nombre: infoProd?.nombre || 'Producto no disponible',
              image_url: infoProd?.image_url || '/placeholder-producto.jpg'
            };
          });

          setDetalles(itemsCompletos);
        }
      } catch (error) {
        console.error("Error al cargar pedido:", error);
        alert("No se pudo cargar el detalle del pedido.");
      } finally {
        setCargando(false);
      }
    }

    fetchDetalle();
  }, [idPedido]);

  // Colores dinámicos para el estado
  const getColorEstado = (estado: string) => {
    const est = (estado || '').toLowerCase();
    if (est.includes('pendiente')) return { bg: '#FEF3C7', color: '#B45309' };
    if (est.includes('preparando')) return { bg: '#E0F2FE', color: '#0369A1' };
    if (est.includes('listo') || est.includes('enviado') || est.includes('entregado')) return { bg: '#DCFCE7', color: '#15803D' };
    if (est.includes('cancelado')) return { bg: '#FEE2E2', color: '#B91C1C' };
    return { bg: '#F1F5F9', color: '#475569' };
  };

  if (cargando) return <div style={{ padding: '50px', textAlign: 'center', fontFamily: 'Nunito' }}>Cargando detalle del pedido...</div>;
  if (!pedido) return <div style={{ padding: '50px', textAlign: 'center', fontFamily: 'Nunito' }}>Pedido no encontrado.</div>;

  const colores = getColorEstado(pedido.estado);

  return (
    <div className="dp-layout">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800;900&display=swap');
        
        .dp-layout { font-family: 'Nunito', sans-serif; background-color: #F8FAFC; min-height: 100vh; display: flex; flex-direction: column; color: #1E293B; }
        
        .dp-nav { background: #FFFFFF; height: 76px; display: flex; align-items: center; padding: 0 28px; border-bottom: 1px solid #E2E8F0; }
        .dp-back-btn { display: flex; align-items: center; gap: 10px; background: none; border: none; font-size: 1rem; font-weight: 800; color: #115B32; cursor: pointer; transition: color 0.2s; padding: 0; }
        .dp-back-btn:hover { color: #C9922B; }

        .dp-container { max-width: 800px; margin: 0 auto; padding: 40px 20px; flex-grow: 1; width: 100%; }
        
        /* Cabecera del pedido */
        .dp-header-card { background: #FFFFFF; border-radius: 24px; padding: 32px; box-shadow: 0 10px 30px rgba(0,0,0,0.03); border: 1px solid #F1F5F9; margin-bottom: 24px; display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 20px; }
        .dp-title-group { display: flex; flex-direction: column; gap: 8px; }
        .dp-title { font-size: 2rem; font-weight: 900; margin: 0; display: flex; align-items: center; gap: 12px; }
        .dp-date { color: #64748B; font-weight: 700; font-size: 1.05rem; }
        .dp-badge { padding: 6px 16px; border-radius: 999px; font-size: 0.9rem; font-weight: 900; text-transform: uppercase; letter-spacing: 0.05em; align-self: flex-start; }

        /* Información de entrega */
        .dp-info-card { background: #F1F5F9; border-radius: 16px; padding: 20px; margin-bottom: 24px; display: flex; align-items: center; gap: 12px; }
        .dp-info-icon { color: #115B32; }
        .dp-info-text h4 { margin: 0 0 4px 0; font-size: 0.9rem; color: #64748B; text-transform: uppercase; font-weight: 800; letter-spacing: 0.05em; }
        .dp-info-text p { margin: 0; font-weight: 800; font-size: 1.1rem; color: #1E293B; }

        /* Lista de productos */
        .dp-items-card { background: #FFFFFF; border-radius: 24px; padding: 32px; box-shadow: 0 10px 30px rgba(0,0,0,0.03); border: 1px solid #F1F5F9; }
        .dp-section-title { font-size: 1.4rem; font-weight: 900; margin: 0 0 24px; border-bottom: 2px solid #F1F5F9; padding-bottom: 16px; }
        
        .dp-item { display: flex; align-items: center; gap: 16px; padding-bottom: 20px; margin-bottom: 20px; border-bottom: 1px solid #F1F5F9; }
        .dp-item:last-child { border-bottom: none; margin-bottom: 0; padding-bottom: 0; }
        .dp-item-img { width: 72px; height: 72px; object-fit: contain; background: #F8FAFC; border-radius: 14px; padding: 8px; flex-shrink: 0; }
        .dp-item-info { flex-grow: 1; min-width: 0; }
        .dp-item-name { margin: 0; font-size: 1.1rem; font-weight: 800; color: #334155; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .dp-item-qty { margin: 4px 0 0; font-size: 0.95rem; color: #64748B; font-weight: 700; }
        .dp-item-price { font-size: 1.3rem; font-weight: 900; color: #115B32; white-space: nowrap; }

        /* Total */
        .dp-total-row { display: flex; justify-content: space-between; align-items: center; margin-top: 32px; padding-top: 24px; border-top: 2px dashed #CBD5E1; }
        .dp-total-label { font-size: 1.3rem; font-weight: 800; color: #64748B; }
        .dp-total-val { font-size: 2.2rem; font-weight: 900; color: #C9922B; }

        /* ================= RESPONSIVE ================= */
        /* Tablets */
        @media (max-width: 768px) {
          .dp-container { padding: 30px 16px; }
          .dp-header-card, .dp-items-card { padding: 24px; }
          .dp-title { font-size: 1.6rem; }
        }

        /* Celulares */
        @media (max-width: 480px) {
          .dp-nav { padding: 0 16px; height: 60px; }
          .dp-container { padding: 16px; margin-top: 10px; }
          
          .dp-header-card { flex-direction: column; align-items: flex-start; padding: 20px; gap: 16px; border-radius: 20px; }
          .dp-title-group { gap: 4px; }
          .dp-title { font-size: 1.4rem; }
          .dp-title svg { width: 20px; height: 20px; }
          .dp-date { font-size: 0.95rem; line-height: 1.4; }
          
          .dp-info-card { padding: 16px; flex-direction: column; align-items: flex-start; gap: 8px; }
          .dp-info-text p { font-size: 1rem; }

          .dp-items-card { padding: 20px; border-radius: 20px; }
          .dp-section-title { font-size: 1.2rem; margin-bottom: 20px; }
          
          /* En celulares hacemos que la fila sea compacta, no una columna */
          .dp-item { align-items: center; gap: 12px; padding-bottom: 16px; margin-bottom: 16px; flex-wrap: wrap; }
          .dp-item-img { width: 56px; height: 56px; border-radius: 10px; padding: 4px; }
          .dp-item-info { width: calc(100% - 68px); flex-grow: unset; }
          .dp-item-name { font-size: 1rem; white-space: normal; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
          .dp-item-qty { font-size: 0.85rem; }
          
          /* El precio total del ítem se va abajo a la derecha */
          .dp-item-price { width: 100%; text-align: right; font-size: 1.15rem; margin-top: 4px; }

          .dp-total-row { flex-direction: column; align-items: flex-end; gap: 4px; margin-top: 24px; padding-top: 16px; }
          .dp-total-label { font-size: 1.1rem; }
          .dp-total-val { font-size: 1.8rem; }
        }
      `}</style>

      <NavbarCheckout />
      
      {/* Barra extra para volver para que no quede todo adentro del nav */}
      <div className="dp-nav">
        <button onClick={() => router.back()} className="dp-back-btn">
          <ArrowLeftIcon /> Volver al historial
        </button>
      </div>

      <div className="dp-container">
        
        {/* Cabecera */}
        <div className="dp-header-card">
          <div className="dp-title-group">
            <h1 className="dp-title"><PackageIcon /> Pedido #{pedido.id_pedido}</h1>
            <span className="dp-date">
              Ingresado el {new Date(pedido.created_at).toLocaleDateString('es-AR', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute:'2-digit' })} hs.
            </span>
          </div>
          <div className="dp-badge" style={{ backgroundColor: colores.bg, color: colores.color }}>
            {pedido.estado}
          </div>
        </div>

        {/* Info Entrega */}
        <div className="dp-info-card">
          <div className="dp-info-icon"><MapPinIcon /></div>
          <div className="dp-info-text">
            <h4>Punto de Entrega</h4>
            <p>{pedido.direccion}</p>
          </div>
        </div>

        {/* Detalle de productos */}
        <div className="dp-items-card">
          <h2 className="dp-section-title">Productos del pedido</h2>
          
          <div className="dp-items-list">
            {detalles.map((item, idx) => (
              <div key={idx} className="dp-item">
                <img src={item.image_url} alt={item.nombre} className="dp-item-img" />
                <div className="dp-item-info">
                  <h3 className="dp-item-name">{item.nombre}</h3>
                  <p className="dp-item-qty">{item.cantidad} unidades a ${item.precio_congelado} c/u</p>
                </div>
                <div className="dp-item-price">
                  ${item.precio_congelado * item.cantidad}
                </div>
              </div>
            ))}
          </div>

          <div className="dp-total-row">
            <span className="dp-total-label">Total del pedido:</span>
            <span className="dp-total-val">${pedido.total_compra}</span>
          </div>
        </div>

      </div>

      <Footer />
    </div>
  );
}