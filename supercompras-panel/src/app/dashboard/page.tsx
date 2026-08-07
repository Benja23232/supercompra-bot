'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@supabase/supabase-js';

// Inicializamos Supabase para escuchar en tiempo real
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

export default function Dashboard() {
  const router = useRouter();
  const [autorizado, setAutorizado] = useState(false);
  const [emailUsuario, setEmailUsuario] = useState('');
  
  // Estados para efectos hover
  const [hoverAuditoria, setHoverAuditoria] = useState(false);
  const [hoverPersonal, setHoverPersonal] = useState(false);

  // ESTADOS PARA ALERTAS
  const [alertaStock, setAlertaStock] = useState<string | null>(null);
  const [nuevoPedidoNotificacion, setNuevoPedidoNotificacion] = useState<{ cliente: string, total: string } | null>(null);

  useEffect(() => {
    const rol = localStorage.getItem('rolUsuario');
    const email = localStorage.getItem('emailUsuario');

    if (!rol) {
      router.push('/');
    } else if (rol !== 'admin') {
      router.push('/pedidos');
    } else {
      setEmailUsuario(email || 'Administrador');
      setAutorizado(true);
      
      // 1. Revisar alertas de Stock y Vencimientos al cargar
      verificarStockYVencimientos();

      // 2. Suscribirse a nuevos Pedidos en Tiempo Real
      const suscripcionPedidos = supabase
        .channel('custom-insert-channel')
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'pedidos' },
          (payload) => {
            console.log('¡Nuevo pedido recibido!', payload);
            // Mostrar notificación con datos del nuevo pedido
            setNuevoPedidoNotificacion({
              cliente: payload.new.nombre_cliente || 'Cliente de WhatsApp',
              total: payload.new.total || '0'
            });

            // Ocultar la notificación después de 6 segundos
            setTimeout(() => {
              setNuevoPedidoNotificacion(null);
            }, 6000);
          }
        )
        .subscribe();

      // Limpiar suscripción al salir del componente
      return () => {
        supabase.removeChannel(suscripcionPedidos);
      };
    }
  }, [router]);

  // Función para buscar stock crítico o vencimientos
  const verificarStockYVencimientos = async () => {
    // Ejemplo: Buscamos productos con stock menor a 5
    const { data, error } = await supabase
      .from('productos')
      .select('*')
      .lt('stock', 5); // lt = less than (menor que)

    if (data && data.length > 0) {
      setAlertaStock(`⚠️ Atención: Tenés ${data.length} producto(s) con stock crítico (menos de 5 unidades).`);
    }
  };

  const cerrarSesion = () => {
    localStorage.clear();
    router.push('/');
  };

  if (!autorizado) return (
    <main style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', backgroundColor: '#f3f4f6' }}>
      <p style={{ fontSize: '1.2rem', color: '#6b7280', fontWeight: 'bold' }}>Verificando accesos...</p>
    </main>
  );

  return (
    <main className="panel-principal" style={{ position: 'relative', minHeight: '100vh', overflow: 'hidden' }}>
      
      {/* NOTIFICACIÓN FLOTANTE (NUEVO PEDIDO) */}
      {nuevoPedidoNotificacion && (
        <div style={{
          position: 'fixed',
          bottom: '30px',
          right: '30px',
          backgroundColor: '#10b981',
          color: 'white',
          padding: '20px',
          borderRadius: '10px',
          boxShadow: '0 10px 25px rgba(0,0,0,0.2)',
          zIndex: 1000,
          animation: 'slideIn 0.5s ease-out',
          display: 'flex',
          flexDirection: 'column',
          gap: '5px'
        }}>
          <strong style={{ fontSize: '1.1rem' }}>🔔 ¡Nuevo Pedido Entrante!</strong>
          <span>{nuevoPedidoNotificacion.cliente} acaba de realizar una compra.</span>
          <span>Total: <strong>${nuevoPedidoNotificacion.total}</strong></span>
          <Link href="/pedidos" style={{ color: '#ecfdf5', textDecoration: 'underline', marginTop: '5px', fontSize: '0.9rem' }}>
            Ver pedido ahora
          </Link>
        </div>
      )}

      <div className="contenedor-panel">
        
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
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.95rem', color: '#334155' }}>
            <span>👋 ¡Hola, administrador <strong>{emailUsuario}</strong>!</span>
          </div>
          <button onClick={cerrarSesion} style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', fontWeight: 'bold', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '5px' }}>
            🔒 Cerrar Sesión
          </button>
        </div>

        {/* BANNER DE ALERTA DE STOCK (OPCIÓN 2) */}
        {alertaStock && (
          <div style={{
            background: '#fffbeb',
            borderLeft: '4px solid #f59e0b',
            padding: '15px 20px',
            marginBottom: '20px',
            borderRadius: '0 8px 8px 0',
            color: '#b45309',
            fontWeight: '500',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}>
            <span>{alertaStock}</span>
            <Link href="/productos" style={{ background: '#f59e0b', color: 'white', padding: '5px 12px', borderRadius: '5px', textDecoration: 'none', fontSize: '0.85rem' }}>
              Revisar Stock
            </Link>
          </div>
        )}

        <div className="cabecera">
          <h1 className="titulo"><span className="texto-degradado">Supercompra</span> Panel</h1>
          <p className="subtitulo">Centro de comando del sistema. Seleccioná un módulo para gestionar tu negocio.</p>
        </div>

        <div className="grilla-tarjetas">
          <Link href="/productos" className="tarjeta tarjeta-azul">
            <div className="icono-caja">📦</div>
            <h2 className="titulo-tarjeta">Productos</h2>
            <p className="texto-tarjeta">Gestionar inventario, actualizar precios y controlar stock físico.</p>
          </Link>

          <Link href="/pedidos" className="tarjeta tarjeta-verde">
            <div className="icono-caja">🛒</div>
            <h2 className="titulo-tarjeta">Pedidos</h2>
            <p className="texto-tarjeta">Ver ventas entrantes, estados de entrega y órdenes de WhatsApp.</p>
          </Link>

          <Link href="/clientes" className="tarjeta tarjeta-violeta">
            <div className="icono-caja">👥</div>
            <h2 className="titulo-tarjeta">Clientes</h2>
            <p className="texto-tarjeta">Base de datos de usuarios, números y contactos frecuentes.</p>
          </Link>

          <Link href="/empleados" className="tarjeta tarjeta-verde" 
            style={{ borderColor: hoverPersonal ? '#10b981' : '#cbd5e1', borderWidth: hoverPersonal ? '2px' : '1px', transition: 'all 0.2s ease-in-out', boxShadow: hoverPersonal ? '0 10px 15px -3px rgba(16, 185, 129, 0.15)' : 'none' }}
            onMouseEnter={() => setHoverPersonal(true)} onMouseLeave={() => setHoverPersonal(false)}>
            <div className="icono-caja">🧑‍💻</div>
            <h2 className="titulo-tarjeta">Personal</h2>
            <p className="texto-tarjeta">Crear nuevas cuentas y gestionar los accesos de tus empleados.</p>
          </Link>
          
          <Link href="/auditorias" className="tarjeta tarjeta-azul" 
            style={{ borderColor: hoverAuditoria ? '#2563eb' : '#cbd5e1', borderWidth: hoverAuditoria ? '2px' : '1px', transition: 'all 0.2s ease-in-out', boxShadow: hoverAuditoria ? '0 10px 15px -3px rgba(37, 99, 235, 0.15)' : 'none' }}
            onMouseEnter={() => setHoverAuditoria(true)} onMouseLeave={() => setHoverAuditoria(false)}>
            <div className="icono-caja">🛡️</div>
            <h2 className="titulo-tarjeta">Auditorías</h2>
            <p className="texto-tarjeta">Registro de actividad del personal, accesos y modificaciones.</p>
          </Link>
        </div>
      </div>
      
      {/* Animación CSS para el cartel emergente */}
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes slideIn {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
      `}} />
    </main>
  );
}