'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function Dashboard() {
  const router = useRouter();
  const [autorizado, setAutorizado] = useState(false);

  useEffect(() => {
    // 1. Buscamos la credencial en la memoria del navegador
    const rol = localStorage.getItem('rolUsuario');

    // 2. Tomamos decisiones de seguridad
    if (!rol) {
      // Si no hay credencial, lo pateamos a la pantalla de login (la raíz '/')
      router.push('/');
    } else if (rol !== 'admin') {
      // Si es un empleado intentando entrar al dashboard, lo mandamos a sus pedidos
      router.push('/pedidos');
    } else {
      // Si es admin, le damos luz verde para ver el panel
      setAutorizado(true);
    }
  }, [router]);

  // Pantalla de espera mientras verifica (evita que se vea el panel por una fracción de segundo)
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
          
          {/* Tarjeta Auditorías */}
          <Link href="/auditorias" className="tarjeta tarjeta-azul" style={{ borderColor: '#3b82f6' }}>
            <div className="icono-caja">🛡️</div>
            <h2 className="titulo-tarjeta">Auditorías</h2>
            <p className="texto-tarjeta">Registro de actividad del personal, accesos y modificaciones en el sistema.</p>
          </Link>

        </div>
      </div>
    </main>
  );
}