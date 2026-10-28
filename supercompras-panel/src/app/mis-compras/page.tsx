'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import NavbarCheckout from '@/components/NavbarCheckout';
import Footer from '@/components/Footer';

const SearchIcon = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>;
const PackageIcon = () => <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#C9922B" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><line x1="16.5" y1="9.4" x2="7.5" y2="4.21"></line><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg>;

export default function MisComprasPage() {
  const router = useRouter();
  
  const [telefono, setTelefono] = useState('');
  const [pedidos, setPedidos] = useState<any[]>([]);
  const [nombreCliente, setNombreCliente] = useState<string>('');
  const [buscando, setBuscando] = useState(false);
  const [yaBuscado, setYaBuscado] = useState(false);

  const buscarPedidos = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!telefono) return;

    setBuscando(true);
    try {
      let telLimpio = telefono.replace(/[^0-9]/g, '');
      if (!telLimpio.startsWith('549')) telLimpio = `549${telLimpio}`;

      const { data: clienteData } = await supabase
        .from('clientes')
        .select('nombre')
        .eq('whatsapp_id', telLimpio)
        .single();
        
      if (clienteData) {
        setNombreCliente(clienteData.nombre);
      } else {
        setNombreCliente('');
      }

      const { data: pedidosData, error } = await supabase
        .from('pedidos')
        .select('*')
        .eq('whatsapp_id', telLimpio)
        .order('id_pedido', { ascending: false });

      if (error) throw error;
      
      setPedidos(pedidosData || []);
      setYaBuscado(true);
    } catch (error) {
      console.error(error);
      alert("Hubo un error al buscar tus pedidos.");
    } finally {
      setBuscando(false);
    }
  };

  const getColorEstado = (estado: string) => {
    const est = (estado || '').toLowerCase();
    if (est.includes('pendiente')) return { bg: '#FEF3C7', color: '#B45309' };
    if (est.includes('preparando')) return { bg: '#E0F2FE', color: '#0369A1' };
    if (est.includes('listo') || est.includes('enviado') || est.includes('entregado')) return { bg: '#DCFCE7', color: '#15803D' };
    if (est.includes('cancelado')) return { bg: '#FEE2E2', color: '#B91C1C' };
    return { bg: '#F1F5F9', color: '#475569' };
  };

  return (
    <div className="mc-layout">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800;900&display=swap');
        
        * { box-sizing: border-box; margin: 0; padding: 0; }

        .mc-layout { font-family: 'Nunito', sans-serif; background-color: #F8FAFC; min-height: 100vh; display: flex; flex-direction: column; color: #1E293B; overflow-x: hidden; width: 100%; max-width: 100vw; }
        .mc-container { max-width: 800px; margin: 0 auto; padding: 40px 20px; flex-grow: 1; width: 100%; }
        
        .mc-card { background: #FFFFFF; border-radius: 24px; padding: 32px; box-shadow: 0 10px 30px rgba(0,0,0,0.03); border: 1px solid #F1F5F9; margin-bottom: 24px; text-align: center; width: 100%; }
        .mc-title { font-size: 1.8rem; font-weight: 900; margin: 0 0 12px; letter-spacing: -0.5px; }
        .mc-subtitle { color: #64748B; font-size: 1.05rem; margin-bottom: 28px; }

        .mc-form { display: flex; gap: 12px; max-width: 500px; margin: 0 auto; }
        .mc-input { flex-grow: 1; padding: 14px 18px; border: 2px solid #E2E8F0; border-radius: 14px; font-size: 1.05rem; font-weight: 600; color: #1E293B; background: #F8FAFC; outline: none; transition: all 0.2s; width: 100%; }
        .mc-input:focus { border-color: #115B32; background: #FFFFFF; box-shadow: 0 0 0 4px rgba(17, 91, 50, 0.1); }
        .mc-submit { padding: 0 24px; background: #115B32; color: #FFFFFF; font-size: 1rem; font-weight: 800; border: none; border-radius: 14px; cursor: pointer; transition: background 0.2s; display: flex; align-items: center; justify-content: center; gap: 8px; flex-shrink: 0; }
        .mc-submit:hover:not(:disabled) { background: #0d4525; }
        .mc-submit:disabled { background: #94A3B8; cursor: not-allowed; }

        .mc-greeting { font-size: 1.5rem; font-weight: 900; color: #115B32; margin-bottom: 20px; text-align: left; line-height: 1.3; }

        .mc-list { display: flex; flex-direction: column; gap: 16px; margin-top: 32px; width: 100%; }
        .mc-order-card { background: #FFFFFF; border-radius: 16px; padding: 20px; border: 1px solid #E2E8F0; display: flex; justify-content: space-between; align-items: center; box-shadow: 0 4px 12px rgba(0,0,0,0.02); transition: transform 0.2s; text-align: left; width: 100%; }
        .mc-order-card:hover { transform: translateY(-2px); border-color: #CBD5E1; }
        
        .mc-order-left { display: flex; flex-direction: column; gap: 8px; flex-grow: 1; }
        .mc-order-id { font-size: 1.2rem; font-weight: 900; color: #1E293B; }
        .mc-order-id span { color: #94A3B8; font-weight: 700; font-size: 1rem; }
        .mc-order-address { font-size: 0.9rem; color: #64748B; font-weight: 600; display: flex; align-items: center; gap: 6px; }
        
        .mc-order-right { text-align: right; display: flex; flex-direction: column; align-items: flex-end; gap: 8px; flex-shrink: 0; }
        .mc-order-total { font-size: 1.4rem; font-weight: 900; color: #115B32; }
        .mc-badge { padding: 4px 12px; border-radius: 999px; font-size: 0.8rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em; }

        .mc-empty { text-align: center; padding: 40px 20px; color: #64748B; width: 100%; }

        /* ================= RESPONSIVE ================= */
        /* Tablets */
        @media (max-width: 768px) {
          .mc-container { padding: 30px 16px; }
          .mc-card { padding: 24px; }
          .mc-title { font-size: 1.6rem; }
          .mc-greeting { font-size: 1.3rem; }
        }
        
        /* Celulares */
        @media (max-width: 480px) {
          .mc-container { padding: 16px; margin-top: 10px; width: 100%; overflow: hidden; }
          .mc-card { padding: 24px 20px; border-radius: 20px; width: 100%; }
          .mc-title { font-size: 1.4rem; }
          .mc-subtitle { font-size: 0.95rem; margin-bottom: 20px; }
          .mc-card svg { width: 40px; height: 40px; }
          
          .mc-form { flex-direction: column; gap: 12px; width: 100%; }
          .mc-input { padding: 12px 16px; font-size: 1rem; width: 100%; }
          .mc-submit { padding: 14px; justify-content: center; width: 100%; }
          
          .mc-list { margin-top: 24px; width: 100%; }
          .mc-greeting { font-size: 1.25rem; margin-bottom: 16px; }

          .mc-order-card { flex-direction: column; align-items: flex-start; gap: 12px; padding: 16px; border-radius: 14px; width: 100%; }
          .mc-order-left { gap: 6px; width: 100%; }
          .mc-order-id { font-size: 1.1rem; }
          
          .mc-order-right { 
            width: 100%; 
            flex-direction: row; 
            justify-content: space-between; 
            align-items: center; 
            border-top: 1px solid #F1F5F9; 
            padding-top: 12px; 
          }
          .mc-order-total { font-size: 1.25rem; }
          .mc-badge { padding: 4px 10px; font-size: 0.75rem; }
        }
      `}</style>

      <NavbarCheckout />

      <div className="mc-container">
        <div className="mc-card">
          <PackageIcon />
          <h1 className="mc-title">Mis Compras</h1>
          <p className="mc-subtitle">Ingresá el número de WhatsApp con el que hiciste tus pedidos para ver el historial.</p>

          <form onSubmit={buscarPedidos} className="mc-form">
            <input 
              type="tel" 
              className="mc-input" 
              placeholder="Ej: 2392 123456" 
              value={telefono} 
              onChange={(e) => setTelefono(e.target.value)}
              required
            />
            <button type="submit" className="mc-submit" disabled={buscando}>
              <SearchIcon /> {buscando ? 'Buscando...' : 'Buscar'}
            </button>
          </form>
        </div>

        {yaBuscado && (
          <div className="mc-list">
            {nombreCliente && pedidos.length > 0 && (
              <h2 className="mc-greeting">👋 ¡Hola, {nombreCliente}! Acá están tus pedidos:</h2>
            )}

            {pedidos.length === 0 ? (
              <div className="mc-empty">
                <h2>No encontramos pedidos</h2>
                <p>No hay registros asociados al número ingresado.</p>
              </div>
            ) : (
              pedidos.map(pedido => {
                const colores = getColorEstado(pedido.estado);
                
                return (
                  <div 
                    key={pedido.id_pedido} 
                    className="mc-order-card"
                    style={{ cursor: 'pointer' }}
                    onClick={() => router.push(`/mis-compras/${pedido.id_pedido}`)}
                  >
                    <div className="mc-order-left">
                      <div className="mc-order-id"><span>Pedido</span> #{pedido.id_pedido}</div>
                      <div className="mc-order-address">
                        {pedido.direccion.includes('Mitre') ? '🏪 Retiro en local' : '🚚 Envío a domicilio'}
                      </div>
                      <div style={{ fontSize: '0.85rem', color: '#94A3B8', fontWeight: 600 }}>
                        {new Date(pedido.created_at).toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute:'2-digit' })}
                      </div>
                    </div>
                    <div className="mc-order-right">
                      <div className="mc-order-total">${pedido.total_compra}</div>
                      <div className="mc-badge" style={{ backgroundColor: colores.bg, color: colores.color }}>
                        {pedido.estado}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>
      
      <Footer />
    </div>
  );
}