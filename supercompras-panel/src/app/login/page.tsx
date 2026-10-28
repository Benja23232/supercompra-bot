'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import NavbarCheckout from '@/components/NavbarCheckout';
import Footer from '@/components/Footer';

const UserIcon = () => <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#C9922B" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>;
const CheckIcon = () => <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#115B32" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>;

export default function LoginPage() {
  const router = useRouter();
  const [telefono, setTelefono] = useState('');
  const [nombre, setNombre] = useState('');
  const [paso, setPaso] = useState(1); // 1: Teléfono, 2: Registro, 3: Bienvenida (Ya existe)
  const [cargando, setCargando] = useState(false);

  // Si entra a la página y ya tiene la sesión guardada de antes, lo mandamos al perfil
  useEffect(() => {
    const userGuardado = localStorage.getItem('supercompras_user');
    if (userGuardado) {
      router.push('/perfil');
    }
  }, [router]);

  const verificarTelefono = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!telefono) return;
    setCargando(true);

    let telLimpio = telefono.replace(/[^0-9]/g, '');
    if (!telLimpio.startsWith('549')) telLimpio = `549${telLimpio}`;
    setTelefono(telLimpio);

    try {
      const { data, error } = await supabase
        .from('clientes')
        .select('*')
        .eq('whatsapp_id', telLimpio)
        .single();

      if (data) {
        // El cliente existe, guardamos su nombre para saludarlo y pasamos al paso 3
        setNombre(data.nombre);
        localStorage.setItem('supercompras_user', JSON.stringify(data));
        setPaso(3);
      } else {
        // No existe, pedimos nombre para registrarlo (Paso 2)
        setPaso(2);
      }
    } catch (err) {
      console.error(err);
      setPaso(2); // Si falla la búsqueda, asumimos que es nuevo
    }
    setCargando(false);
  };

  const registrarCliente = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nombre) return;
    setCargando(true);

    try {
      const { data, error } = await supabase
        .from('clientes')
        .upsert({ whatsapp_id: telefono, nombre: nombre }, { onConflict: 'whatsapp_id' })
        .select()
        .single();

      if (error) throw error;

      if (data) {
        localStorage.setItem('supercompras_user', JSON.stringify(data));
        setPaso(3); // Lo mandamos a la pantalla de bienvenida también
      }
    } catch (err) {
      console.error(err);
      alert("Hubo un error al registrarte.");
    }
    setCargando(false);
  };

  return (
    <div className="login-layout">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800;900&display=swap');
        
        .login-layout { font-family: 'Nunito', sans-serif; background-color: #F8FAFC; min-height: 100vh; display: flex; flex-direction: column; color: #1E293B; }
        .login-container { max-width: 500px; margin: 0 auto; padding: 60px 20px; flex-grow: 1; width: 100%; display: flex; align-items: center; justify-content: center; }
        .login-card { background: #FFFFFF; border-radius: 24px; padding: 40px 32px; box-shadow: 0 10px 30px rgba(0,0,0,0.03); border: 1px solid #F1F5F9; text-align: center; width: 100%; }
        .login-title { font-size: 1.8rem; font-weight: 900; margin: 16px 0 8px; letter-spacing: -0.5px; line-height: 1.2; }
        .login-subtitle { color: #64748B; font-size: 1.05rem; margin-bottom: 28px; line-height: 1.5; }
        
        .login-form { display: flex; flex-direction: column; gap: 16px; text-align: left; }
        .login-label { font-size: 0.9rem; font-weight: 800; color: #475569; margin-bottom: -8px; }
        .login-input { width: 100%; padding: 14px 18px; border: 2px solid #E2E8F0; border-radius: 14px; font-size: 1.05rem; font-weight: 600; color: #1E293B; background: #F8FAFC; outline: none; transition: all 0.2s; }
        .login-input:focus { border-color: #115B32; background: #FFFFFF; box-shadow: 0 0 0 4px rgba(17, 91, 50, 0.1); }
        
        .login-submit { margin-top: 8px; padding: 16px; background: #115B32; color: #FFFFFF; font-size: 1.1rem; font-weight: 900; border: none; border-radius: 14px; cursor: pointer; transition: transform 0.2s, background 0.2s; }
        .login-submit:hover:not(:disabled) { background: #0d4525; transform: translateY(-2px); }
        .login-submit:disabled { background: #94A3B8; cursor: not-allowed; transform: none; }
        .user-name-highlight { color: #115B32; font-weight: 900; }

        /* ================= RESPONSIVE ================= */
        /* Tablets */
        @media (max-width: 768px) {
          .login-container { padding: 40px 16px; }
          .login-card { padding: 32px 24px; }
          .login-title { font-size: 1.6rem; }
          .login-subtitle { font-size: 1rem; margin-bottom: 24px; }
          .login-input { padding: 12px 16px; font-size: 1rem; }
          .login-submit { padding: 14px; font-size: 1.05rem; }
        }

        /* Celulares */
        @media (max-width: 480px) {
          .login-container { padding: 20px 16px; align-items: flex-start; margin-top: 20px; }
          .login-card { padding: 24px 20px; border-radius: 20px; }
          .login-title { font-size: 1.4rem; }
          .login-subtitle { font-size: 0.95rem; margin-bottom: 20px; }
          
          /* Achicamos un poco el SVG en celulares */
          .login-card svg { width: 40px; height: 40px; }
        }
      `}</style>
      
      <NavbarCheckout />

      <div className="login-container">
        <div className="login-card">
          {paso === 3 ? <CheckIcon /> : <UserIcon />}
          
          {paso === 1 && (
            <>
              <h1 className="login-title">¡Hola! Ingresá</h1>
              <p className="login-subtitle">Ingresá tu WhatsApp para ver tus pedidos o comprar más rápido.</p>
              <form onSubmit={verificarTelefono} className="login-form">
                <label className="login-label">Número de WhatsApp</label>
                <input type="tel" className="login-input" placeholder="Ej: 2392 123456" value={telefono} onChange={(e) => setTelefono(e.target.value)} required />
                <button type="submit" className="login-submit" disabled={cargando}>{cargando ? 'Verificando...' : 'Continuar'}</button>
              </form>
            </>
          )}

          {paso === 2 && (
            <>
              <h1 className="login-title">Creá tu perfil</h1>
              <p className="login-subtitle">Parece que sos nuevo. Decinos tu nombre para agendarte.</p>
              <form onSubmit={registrarCliente} className="login-form">
                <label className="login-label">Nombre y Apellido</label>
                <input type="text" className="login-input" placeholder="Ej: Juan Pérez" value={nombre} onChange={(e) => setNombre(e.target.value)} required />
                <button type="submit" className="login-submit" disabled={cargando}>{cargando ? 'Guardando...' : 'Crear cuenta'}</button>
              </form>
            </>
          )}

          {paso === 3 && (
            <>
              <h1 className="login-title">¡Qué bueno verte, <br/><span className="user-name-highlight">{nombre}</span>!</h1>
              <p className="login-subtitle">Tu cuenta ya está lista y guardada.</p>
              <button onClick={() => router.push('/perfil')} className="login-submit" style={{ width: '100%' }}>Ir a mi perfil</button>
            </>
          )}

        </div>
      </div>

      <Footer />
    </div>
  );
}