import Link from 'next/link';

export default function Dashboard() {
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

        </div>
      </div>
    </main>
  );
}