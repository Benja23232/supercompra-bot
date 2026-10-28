'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import NavbarCheckout from '@/components/NavbarCheckout';
import Footer from '@/components/Footer';

const PackageIcon = () => <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="16.5" y1="9.4" x2="7.5" y2="4.21"></line><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg>;
const LogOutIcon = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>;

export default function PerfilPage() {
  const router = useRouter();
  const [usuario, setUsuario] = useState<any>(null);

  useEffect(() => {
    const userGuardado = localStorage.getItem('supercompras_user');
    if (userGuardado) {
      setUsuario(JSON.parse(userGuardado));
    } else {
      router.push('/login'); // Si no hay sesión, lo patea al login
    }
  }, [router]);

  const cerrarSesion = () => {
    localStorage.removeItem('supercompras_user');
    router.push('/tienda');
  };

  if (!usuario) return null;

  return (
    <div className="pf-layout">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800;900&display=swap');
        
        .pf-layout { font-family: 'Nunito', sans-serif; background-color: #F8FAFC; min-height: 100vh; display: flex; flex-direction: column; color: #1E293B; }
        .pf-container { max-width: 600px; margin: 0 auto; padding: 60px 20px; flex-grow: 1; width: 100%; }
        
        .pf-card { background: #FFFFFF; border-radius: 24px; padding: 40px; box-shadow: 0 10px 30px rgba(0,0,0,0.03); border: 1px solid #F1F5F9; text-align: center; }
        .pf-avatar { width: 80px; height: 80px; border-radius: 50%; background: #E8F5E9; color: #115B32; font-size: 2.2rem; font-weight: 900; display: flex; align-items: center; justify-content: center; margin: 0 auto 16px; border: 4px solid #F1F5F9; }
        .pf-title { font-size: 2rem; font-weight: 900; margin: 0 0 4px; letter-spacing: -0.5px; }
        .pf-subtitle { color: #64748B; font-size: 1.1rem; margin-bottom: 32px; font-weight: 700; }
        
        .pf-menu { display: flex; flex-direction: column; gap: 12px; }
        .pf-btn { display: flex; align-items: center; justify-content: center; gap: 12px; padding: 18px; border-radius: 16px; font-size: 1.1rem; font-weight: 800; cursor: pointer; transition: all 0.2s; border: none; text-decoration: none; }
        .pf-btn-primary { background: #C9922B; color: #FFFFFF; box-shadow: 0 8px 20px rgba(201, 146, 43, 0.25); }
        .pf-btn-primary:hover { background: #B07D1E; transform: translateY(-2px); }
        .pf-btn-secondary { background: #F1F5F9; color: #64748B; }
        .pf-btn-secondary:hover { background: #E2E8F0; color: #B91C1C; }

        /* ================= RESPONSIVE ================= */
        /* Tablets */
        @media (max-width: 768px) {
          .pf-container { padding: 40px 16px; }
          .pf-card { padding: 32px 24px; }
          .pf-title { font-size: 1.8rem; }
          .pf-subtitle { font-size: 1rem; margin-bottom: 24px; }
          .pf-btn { padding: 16px; font-size: 1.05rem; }
        }

        /* Celulares */
        @media (max-width: 480px) {
          .pf-container { padding: 20px 16px; margin-top: 20px; }
          .pf-card { padding: 24px 20px; border-radius: 20px; }
          
          /* Achicamos un poco el avatar y los textos para que no se vean toscos */
          .pf-avatar { width: 68px; height: 68px; font-size: 1.8rem; margin-bottom: 12px; }
          .pf-title { font-size: 1.6rem; }
          .pf-subtitle { font-size: 0.95rem; margin-bottom: 24px; }
          
          .pf-menu { gap: 10px; }
          .pf-btn { padding: 14px; font-size: 1rem; border-radius: 14px; }
        }
      `}</style>
      
      <NavbarCheckout />

      <div className="pf-container">
        <div className="pf-card">
          <div className="pf-avatar">
            {usuario.nombre.charAt(0).toUpperCase()}
          </div>
          <h1 className="pf-title">{usuario.nombre}</h1>
          <p className="pf-subtitle">📱 {usuario.whatsapp_id}</p>

          <div className="pf-menu">
            <button onClick={() => router.push('/mis-compras')} className="pf-btn pf-btn-primary">
              <PackageIcon /> Ver Historial de Compras
            </button>
            
            <button onClick={cerrarSesion} className="pf-btn pf-btn-secondary" style={{ marginTop: '10px' }}>
              <LogOutIcon /> Cerrar Sesión
            </button>
          </div>
        </div>
      </div>

      <Footer />
    </div>
  );
}