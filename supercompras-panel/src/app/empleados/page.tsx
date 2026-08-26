'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function CrearEmpleado() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rol, setRol] = useState('empleado'); // <--- NUEVO: Estado para el rol ('empleado' o 'repartidor')
  const [mensaje, setMensaje] = useState('');
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(false);

  // Verificamos que solo el admin pueda entrar acá
  useEffect(() => {
    const rolUsuario = localStorage.getItem('rolUsuario');
    if (rolUsuario !== 'admin') {
      router.push('/pedidos');
    }
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMensaje('');
    setError('');
    setCargando(true);

    try {
      const res = await fetch('/api/crear-usuario', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Mandamos también el rol al backend para que lo guarde en Supabase (en user_metadata o tabla de perfiles)
        body: JSON.stringify({ email, password, rol }),
      });

      const data = await res.json();

      if (data.success) {
        setMensaje(`¡Excelente! El usuario ${email} fue creado con éxito como [${rol}].`);
        setEmail('');
        setPassword('');
        setRol('empleado');
      } else {
        setError(data.error || 'Hubo un error al registrar el usuario.');
      }
    } catch (err) {
      setError('Error al intentar conectar con el servidor.');
    } finally {
      setCargando(false);
    }
  };

  return (
    <main style={{ padding: '40px', maxWidth: '500px', margin: '0 auto', fontFamily: 'sans-serif' }}>
      <div style={{ marginBottom: '20px' }}>
        <Link href="/dashboard" style={{ color: '#2563eb', textDecoration: 'none', fontWeight: 'bold' }}>
          ← Volver al Panel
        </Link>
      </div>

      <div style={{ background: '#ffffff', padding: '30px', borderRadius: '12px', boxShadow: '0 4px 6px rgba(0,0,0,0.05)', border: '1px solid #e2e8f0' }}>
        <h1 style={{ marginBottom: '10px', fontSize: '1.5rem', color: '#1e293b' }}>👤 Nuevo Usuario / Personal</h1>
        <p style={{ marginBottom: '20px', color: '#64748b', fontSize: '0.95rem' }}>
          Creá una nueva cuenta y definí qué permisos tendrá en el sistema.
        </p>

        {mensaje && (
          <div style={{ padding: '12px', marginBottom: '15px', backgroundColor: '#dcfce7', color: '#166534', borderRadius: '8px', fontSize: '0.9rem', fontWeight: '500' }}>
            {mensaje}
          </div>
        )}

        {error && (
          <div style={{ padding: '12px', marginBottom: '15px', backgroundColor: '#fee2e2', color: '#991b1b', borderRadius: '8px', fontSize: '0.9rem', fontWeight: '500' }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '5px', fontWeight: '500', color: '#334155' }}>Correo Electrónico</label>
            <input 
              type="email" 
              required
              value={email} 
              onChange={(e) => setEmail(e.target.value)}
              placeholder="personal@supercompra.com"
              style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '1rem', boxSizing: 'border-box' }}
            />
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: '5px', fontWeight: '500', color: '#334155' }}>Contraseña de acceso</label>
            <input 
              type="password" 
              required
              minLength={6}
              value={password} 
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Mínimo 6 caracteres"
              style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '1rem', boxSizing: 'border-box' }}
            />
          </div>

          {/* NUEVO: Selector de Rol */}
          <div>
            <label style={{ display: 'block', marginBottom: '5px', fontWeight: '500', color: '#334155' }}>Rol en el Sistema</label>
            <select
              value={rol}
              onChange={(e) => setRol(e.target.value)}
              style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '1rem', backgroundColor: '#fff', boxSizing: 'border-box' }}
            >
              <option value="empleado">📦 Empleado (Depósito / Armado)</option>
              <option value="repartidor">🛵 Repartidor (Solo vista de rutas)</option>
            </select>
          </div>

          <button 
            type="submit" 
            disabled={cargando}
            style={{ 
              marginTop: '10px',
              padding: '12px', 
              backgroundColor: '#10b981', 
              color: '#ffffff', 
              border: 'none', 
              borderRadius: '6px', 
              fontSize: '1rem', 
              fontWeight: 'bold', 
              cursor: cargando ? 'not-allowed' : 'pointer',
              opacity: cargando ? 0.7 : 1,
              transition: 'background-color 0.2s'
            }}
          >
            {cargando ? 'Guardando...' : 'Crear Usuario'}
          </button>
        </form>
      </div>
    </main>
  );
}