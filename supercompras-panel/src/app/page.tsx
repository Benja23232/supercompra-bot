'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
// Importamos nuestra nueva herramienta
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
    
    // GUARDAMOS LOS DATOS EN MEMORIA
    localStorage.setItem('rolUsuario', rolObtenido);
    localStorage.setItem('emailUsuario', email);

    // REGISTRAMOS LA AUDITORÍA
    await logAuditoria('Seguridad', 'Inicio de sesión', 'Ingresó correctamente al sistema');

    if (rolObtenido === 'admin') {
      router.push('/dashboard'); 
    } else {
      router.push('/pedidos');   
    }
  };

  return (
    <main style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', backgroundColor: '#f3f4f6' }}>
      <form 
        onSubmit={handleLogin} 
        style={{ background: '#fff', padding: '40px', borderRadius: '12px', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)', display: 'flex', flexDirection: 'column', gap: '20px', width: '100%', maxWidth: '400px' }}
      >
        <div style={{ textAlign: 'center' }}>
          <h1 style={{ margin: '0 0 10px 0', fontSize: '2rem', color: '#111827' }}>Supercompra</h1>
          <p style={{ margin: 0, color: '#6b7280' }}>Ingresá tus credenciales para administrar</p>
        </div>
        
        {error && (
          <div style={{ backgroundColor: '#fee2e2', color: '#b91c1c', padding: '10px', borderRadius: '6px', textAlign: 'center', fontSize: '0.9rem' }}>
            {error}
          </div>
        )}

        <label style={{ display: 'flex', flexDirection: 'column', gap: '5px', color: '#374151', fontWeight: 'bold' }}>
          Correo electrónico:
          <input 
            type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="admin@supercompra.com"
            style={{ padding: '12px', borderRadius: '6px', border: '1px solid #d1d5db', outline: 'none' }} 
          />
        </label>

        <label style={{ display: 'flex', flexDirection: 'column', gap: '5px', color: '#374151', fontWeight: 'bold' }}>
          Contraseña:
          <input 
            type="password" value={password} onChange={(e) => setPassword(e.target.value)} required placeholder="••••••••"
            style={{ padding: '12px', borderRadius: '6px', border: '1px solid #d1d5db', outline: 'none' }} 
          />
        </label>

        <button 
          type="submit" disabled={cargando}
          style={{ padding: '12px', backgroundColor: cargando ? '#93c5fd' : '#2563eb', color: '#fff', border: 'none', borderRadius: '6px', cursor: cargando ? 'not-allowed' : 'pointer', fontWeight: 'bold', fontSize: '1rem', marginTop: '10px' }}
        >
          {cargando ? 'Verificando...' : 'Ingresar al Panel'}
        </button>
      </form>
    </main>
  );
}