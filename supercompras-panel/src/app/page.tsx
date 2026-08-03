'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import { logAuditoria } from '@/lib/auditoria'; 

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(false);
  
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setCargando(true);

    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (authError) {
      setError('Credenciales incorrectas. Verificá tu email y contraseña.');
      setCargando(false);
      return;
    }

    const { data: roleData, error: roleError } = await supabase
      .from('roles')
      .select('rol')
      .eq('email', email)
      .maybeSingle();

    const rolObtenido = roleData ? roleData.rol : 'usuario';
    
    // Guardamos los datos en memoria
    localStorage.setItem('rolUsuario', rolObtenido);
    localStorage.setItem('emailUsuario', email);

    // Registramos la auditoría del inicio de sesión
    await logAuditoria('Seguridad', 'Inicio de sesión', 'Ingresó correctamente al sistema');

    if (rolObtenido === 'admin') {
      router.push('/dashboard'); 
    } else {
      router.push('/pedidos');   
    }
  };

  return (
    // Reutilizamos panel-principal y lo centramos verticalmente
    <main className="panel-principal" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', padding: '20px' }}>
      
      {/* Limitamos el ancho para que no se estire en pantallas grandes */}
      <div className="contenedor-panel" style={{ width: '100%', maxWidth: '450px', margin: '0' }}>
        
        <div className="cabecera" style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <h1 className="titulo">
            <span className="texto-degradado">Supercompra</span>
          </h1>
          <p className="subtitulo">
            Acceso al centro de comando
          </p>
        </div>

        {/* Usamos la clase 'tarjeta' para mantener la coherencia visual */}
        <form 
          onSubmit={handleLogin} 
          className="tarjeta"
          style={{ 
            display: 'flex', 
            flexDirection: 'column', 
            gap: '20px', 
            padding: '2rem',
            cursor: 'default'
          }}
        >
          {error && (
            <div style={{ backgroundColor: '#fee2e2', color: '#b91c1c', padding: '12px', borderRadius: '8px', textAlign: 'center', fontSize: '0.95rem', fontWeight: '500' }}>
              {error}
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label style={{ fontWeight: '600', fontSize: '0.95rem', opacity: 0.8 }}>
              Correo electrónico
            </label>
            <input 
              type="email" 
              value={email} 
              onChange={(e) => setEmail(e.target.value)} 
              required 
              placeholder="admin@supercompra.com"
              style={{ 
                padding: '14px', 
                borderRadius: '8px', 
                border: '1px solid #d1d5db', 
                outline: 'none',
                fontSize: '1rem',
                width: '100%',
                boxSizing: 'border-box',
                backgroundColor: '#fff',
                color: '#111827'
              }} 
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label style={{ fontWeight: '600', fontSize: '0.95rem', opacity: 0.8 }}>
              Contraseña
            </label>
            <input 
              type="password" 
              value={password} 
              onChange={(e) => setPassword(e.target.value)} 
              required 
              placeholder="••••••••"
              style={{ 
                padding: '14px', 
                borderRadius: '8px', 
                border: '1px solid #d1d5db', 
                outline: 'none',
                fontSize: '1rem',
                width: '100%',
                boxSizing: 'border-box',
                backgroundColor: '#fff',
                color: '#111827'
              }} 
            />
          </div>

          <button 
            type="submit" 
            disabled={cargando}
            style={{ 
              padding: '14px', 
              backgroundColor: cargando ? '#93c5fd' : '#3b82f6', 
              color: '#fff', 
              border: 'none', 
              borderRadius: '8px', 
              cursor: cargando ? 'not-allowed' : 'pointer', 
              fontWeight: 'bold', 
              fontSize: '1.1rem',
              marginTop: '10px',
              transition: 'background-color 0.2s',
              boxShadow: '0 4px 6px -1px rgba(59, 130, 246, 0.3)'
            }}
          >
            {cargando ? 'Verificando...' : 'Ingresar al sistema'}
          </button>
        </form>
      </div>
    </main>
  );
}