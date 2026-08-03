'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function Dashboard() {
  const router = useRouter();
  const [autorizado, setAutorizado] = useState(false);
  const [emailUsuario, setEmailUsuario] = useState('');
  
  // Estado para el efecto hover del borde de la tarjeta de auditorías
  const [hoverAuditoria, setHoverAuditoria] = useState(false);

  useEffect(() => {
    // 1. Buscamos las credenciales en la memoria del navegador
    const rol = localStorage.getItem('rolUsuario');
    const email = localStorage.getItem('emailUsuario');

    // 2. Tomamos decisiones de seguridad
    if (!rol) {
      router.push('/');
    } else if (rol !== 'admin') {
      router.push('/pedidos');
    } else {
      setEmailUsuario(email || 'Administrador');
      setAutorizado(true);
    }
  }, [router]);

  const cerrarSesion = () => {
    localStorage.clear();
    router.push('/');
  };

  if (!autorizado) {
    return (
      <main style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', backgroundColor: '#f3f4f6' }}>
        <p style={{ fontSize: '1.2rem', color: '#6b7280', fontWeight: 'bold' }}>Verificando accesos...</p>
      </main>
    );
  }

  return (
    <main className="panel-principal">
      <div className="contenedor-panel">
        
        {/* Barra de bienvenida y sesión del Administrador */}
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center', 
          marginBottom: '20px', 
          padding: '12px 20px', 
          background: '#f8fafc', 
          borderRadius: '10px', 
          border: '1px solid #e2e8f0', 
          flexWrap: 'wrap', 
          gap: '10px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.95rem', color: '#334155' }}>
            <span>👋 ¡Hola, administrador <strong>{emailUsuario}</strong>!</span>
          </div>
          <button 
            onClick={cerrarSesion} 
            style={{ 
              background: 'none', 
              border: 'none', 
              color: '#dc2626', 
              cursor: 'pointer', 
              fontWeight: 'bold', 
              fontSize: '0.9rem', 
              display: 'flex', 
              alignItems: 'center', 
              gap: '5px' 
            }}
          >
            🔒 Cerrar Sesión
          </button>
        </div>

        {/* Cabecera */}
        <div className="cabecera">
          <h1 className="titulo">
            <span className="texto-degradado">Supercompra</span> Panel
          </h1>
          <p className="subtitulo">
            Centro de comando del sistema. Seleccioná un módulo para gestionar tu negocio.
          </p>
        </div>

        {/* Grilla de Tarjetas */}
        <div className="grilla-tarjetas">
          
          {/* Tarjeta Productos */}
          <Link href="/productos" className="tarjeta tarjeta-azul">
            <div className="icono-caja">📦</div>
            <h2 className="titulo-tarjeta">Productos</h2>
            <p className="texto-tarjeta">Gestionar inventario, actualizar precios y controlar stock físico.</p>
          </Link>

          {/* Tarjeta Pedidos */}
          <Link href="/pedidos" className="tarjeta tarjeta-verde">
            <div className="icono-caja">🛒</div>
            <h2 className="titulo-tarjeta">Pedidos</h2>
            <p className="texto-tarjeta">Ver ventas entrantes, estados de entrega y órdenes de WhatsApp.</p>
          </Link>

          {/* Tarjeta Clientes */}
          <Link href="/clientes" className="tarjeta tarjeta-violeta">
            <div className="icono-caja">👥</div>
            <h2 className="titulo-tarjeta">Clientes</h2>
            <p className="texto-tarjeta">Base de datos de usuarios, números y contactos frecuentes.</p>
          </Link>
          
          {/* Tarjeta Auditorías con borde activo en hover */}
          <Link 
            href="/auditorias" 
            className="tarjeta tarjeta-azul" 
            style={{ 
              borderColor: hoverAuditoria ? '#2563eb' : '#cbd5e1', 
              borderWidth: hoverAuditoria ? '2px' : '1px',
              transition: 'all 0.2s ease-in-out',
              boxShadow: hoverAuditoria ? '0 10px 15px -3px rgba(37, 99, 235, 0.15)' : 'none'
            }}
            onMouseEnter={() => setHoverAuditoria(true)}
            onMouseLeave={() => setHoverAuditoria(false)}
          >
            <div className="icono-caja">🛡️</div>
            <h2 className="titulo-tarjeta">Auditorías</h2>
            <p className="texto-tarjeta">Registro de actividad del personal, accesos y modificaciones en el sistema.</p>
          </Link>

        </div>
      </div>
    </main>
  );
}