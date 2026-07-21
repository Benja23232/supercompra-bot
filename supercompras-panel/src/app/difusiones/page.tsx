'use client';

import { useState } from 'react';
import Link from 'next/link';

export default function Difusiones() {
  // Dejamos el nombre de la plantilla fijo por defecto (el que enviaste a revisión)
  const [templateName, setTemplateName] = useState('promo_dinamica');
  
  // Estados para los 4 huecos de tu plantilla
  const [prod1, setProd1] = useState('');
  const [prod2, setProd2] = useState('');
  const [precio, setPrecio] = useState('');
  const [linkCatalogo, setLinkCatalogo] = useState('');
  
  const [loading, setLoading] = useState(false);
  const [resultado, setResultado] = useState<any>(null);

  const enviarDifusion = async () => {
    // 1. Validamos que no deje ningún hueco vacío
    if (!templateName.trim() || !prod1.trim() || !prod2.trim() || !precio.trim() || !linkCatalogo.trim()) {
      alert('Por favor, completá todos los campos de la promoción.');
      return;
    }

    // 2. Alerta de seguridad con vista previa
    const confirmar = confirm(
      `⚠️ ATENCIÓN: Vas a enviar este mensaje a TODOS tus clientes:\n\n"¡Hola! 👋 Hoy en Supercompra tenemos ofertas exclusivas.\n🎉 Llevate ${prod1} y ${prod2} por un total de ${precio}..."\n\n¿Estás seguro? Esta acción no se puede deshacer y Meta cobrará por cada mensaje entregado.`
    );
    
    if (!confirmar) return;

    setLoading(true);
    setResultado(null);

    try {
      // ⚠️ REEMPLAZÁ ESTO POR LA URL REAL DE TU SERVIDOR EN RENDER ⚠️
      const URL_BACKEND = 'https://supercompra-bot-backend.onrender.com';
      
      // Agrupamos las variables en el MISMO ORDEN que los {{huecos}} de Meta
      const variablesOrdenadas = [prod1, prod2, precio, linkCatalogo];

      const response = await fetch(`${URL_BACKEND}/api/difusion`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          templateName: templateName,
          variables: variablesOrdenadas 
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Error al enviar la difusión');
      }

      // 3. Éxito: Mostramos resultado y limpiamos el formulario
      setResultado(data);
      setProd1('');
      setProd2('');
      setPrecio('');
      // No limpiamos el link porque suele ser siempre el mismo
      
    } catch (error: any) {
      console.error(error);
      alert('Hubo un problema: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="contenedor-pagina" style={{ maxWidth: '800px', margin: '0 auto', padding: '20px' }}>
      <Link href="/" className="link-volver" style={{ display: 'inline-block', marginBottom: '20px', color: '#2563eb', textDecoration: 'none' }}>
        🔙 Volver al panel principal
      </Link>

      <div className="encabezado-pagina">
        <h1 style={{ fontSize: '2rem', marginBottom: '10px' }}>📢 Lanzar Promoción</h1>
        <p style={{ color: '#4b5563', marginBottom: '20px' }}>
          Completá los campos para armar la oferta de la semana. El mensaje se enviará a todos los clientes registrados.
        </p>
      </div>

      <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', padding: '2rem', borderRadius: '8px' }}>
        
        <div style={{ marginBottom: '15px' }}>
          <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>Nombre de la Plantilla (Meta)</label>
          <input 
            type="text" 
            value={templateName}
            onChange={(e) => setTemplateName(e.target.value)}
            style={{ width: '100%', padding: '0.8rem', border: '1px solid #ccc', borderRadius: '4px' }}
          />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginBottom: '15px' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>Producto 1 (ej: Coca-Cola 2L)</label>
            <input 
              type="text" 
              value={prod1}
              onChange={(e) => setProd1(e.target.value)}
              placeholder="¿Qué producto?"
              style={{ width: '100%', padding: '0.8rem', border: '1px solid #ccc', borderRadius: '4px' }}
            />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>Producto 2 (ej: Papas Lays)</label>
            <input 
              type="text" 
              value={prod2}
              onChange={(e) => setProd2(e.target.value)}
              placeholder="¿Con qué lo combinás?"
              style={{ width: '100%', padding: '0.8rem', border: '1px solid #ccc', borderRadius: '4px' }}
            />
          </div>
        </div>

        <div style={{ marginBottom: '15px' }}>
          <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>Precio Total (ej: $4500)</label>
          <input 
            type="text" 
            value={precio}
            onChange={(e) => setPrecio(e.target.value)}
            placeholder="¿Cuánto salen los dos?"
            style={{ width: '100%', padding: '0.8rem', border: '1px solid #ccc', borderRadius: '4px' }}
          />
        </div>

        <div style={{ marginBottom: '25px' }}>
          <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>Link al Catálogo</label>
          <input 
            type="text" 
            value={linkCatalogo}
            onChange={(e) => setLinkCatalogo(e.target.value)}
            placeholder="https://wa.me/c/549..."
            style={{ width: '100%', padding: '0.8rem', border: '1px solid #ccc', borderRadius: '4px' }}
          />
        </div>

        <button 
          onClick={enviarDifusion} 
          disabled={loading}
          style={{ 
            padding: '1rem', 
            fontSize: '1.1rem', 
            fontWeight: 'bold',
            width: '100%', 
            backgroundColor: loading ? '#9ca3af' : '#2563eb', 
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            cursor: loading ? 'not-allowed' : 'pointer' 
          }}
        >
          {loading ? '⏳ Disparando mensajes...' : '🚀 Enviar Promoción a todos los clientes'}
        </button>

        {resultado && (
          <div style={{ marginTop: '25px', padding: '20px', background: '#dcfce7', border: '1px solid #bbf7d0', color: '#166534', borderRadius: '8px' }}>
            <h3 style={{ marginBottom: '10px' }}>✅ {resultado.mensaje}</h3>
            <ul style={{ lineHeight: '1.8' }}>
              <li><strong>Total en base de datos:</strong> {resultado.total_clientes}</li>
              <li><strong>Enviados con éxito:</strong> {resultado.enviados}</li>
              <li><strong>Fallidos:</strong> {resultado.fallidos}</li>
            </ul>
          </div>
        )}
      </div>
    </main>
  );
}