'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';

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

    // 1. Supabase verifica si el usuario y la contraseña son correctos
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (authError) {
      setError('Credenciales incorrectas. Verificá tu email y contraseña.');
      setCargando(false);
      return;
    }

    // 2. Si entró bien, consultamos qué ROL tiene en nuestra tabla de roles
    const { data: roleData, error: roleError } = await supabase
      .from('roles')
      .select('rol')
      .eq('email', email)
      .single();

    // --- DEPURACIÓN (Abrí la consola con F12 en tu navegador para ver esto) ---
    console.log("Correo ingresado:", email);
    console.log("Resultado de Supabase en roles:", roleData);
    console.log("Error de roles (si hay):", roleError);

    // 3. Determinamos el rol (por defecto 'usuario' si no se encuentra)
    const rolObtenido = roleData ? roleData.rol : 'usuario';
    console.log("Rol definido final:", rolObtenido);

    localStorage.setItem('rolUsuario', rolObtenido);

    // 4. Redirección inteligente basada en el rol
    if (rolObtenido === 'admin') {
      console.log("Redirigiendo a /dashboard...");
      router.push('/dashboard'); // El administrador va al menú principal con tarjetas
    } else {
      console.log("Redirigiendo a /pedidos...");
      router.push('/pedidos');   // El empleado va directo a la gestión de pedidos
    }
  };

  return (
    <main style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', backgroundColor: '#f3f4f6' }}>
      <form 
        onSubmit={handleLogin} 
        style={{ 
          background: '#fff', 
          padding: '40px', 
          borderRadius: '12px', 
          boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)', 
          display: 'flex', 
          flexDirection: 'column', 
          gap: '20px', 
          width: '100%', 
          maxWidth: '400px' 
        }}
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
            type="email" 
            value={email} 
            onChange={(e) => setEmail(e.target.value)} 
            required 
            placeholder="admin@supercompra.com"
            style={{ padding: '12px', borderRadius: '6px', border: '1px solid #d1d5db', outline: 'none' }} 
          />
        </label>

        <label style={{ display: 'flex', flexDirection: 'column', gap: '5px', color: '#374151', fontWeight: 'bold' }}>
          Contraseña:
          <input 
            type="password" 
            value={password} 
            onChange={(e) => setPassword(e.target.value)} 
            required 
            placeholder="••••••••"
            style={{ padding: '12px', borderRadius: '6px', border: '1px solid #d1d5db', outline: 'none' }} 
          />
        </label>

        <button 
          type="submit" 
          disabled={cargando}
          style={{ 
            padding: '12px', 
            backgroundColor: cargando ? '#93c5fd' : '#2563eb', 
            color: '#fff', 
            border: 'none', 
            borderRadius: '6px', 
            cursor: cargando ? 'not-allowed' : 'pointer', 
            fontWeight: 'bold', 
            fontSize: '1rem',
            marginTop: '10px',
            transition: 'background-color 0.2s'
          }}
        >
          {cargando ? 'Verificando...' : 'Ingresar al Panel'}
        </button>
      </form>
    </main>
  );
}