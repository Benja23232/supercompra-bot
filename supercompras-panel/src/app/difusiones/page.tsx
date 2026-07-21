'use client';

import { useState } from 'react';
import Link from 'next/link';

export default function Difusiones() {
  const [templateName, setTemplateName] = useState('');
  const [loading, setLoading] = useState(false);
  const [resultado, setResultado] = useState<any>(null);

  const enviarDifusion = async () => {
    // 1. Validación básica
    if (!templateName.trim()) {
      alert('Por favor, ingresá el nombre de la plantilla aprobada por Meta.');
      return;
    }

    // 2. Alerta de seguridad (¡Cuesta plata!)
    const confirmar = confirm(
      `⚠️ ATENCIÓN: ¿Estás seguro de enviar la plantilla "${templateName}" a TODOS los clientes?\n\nEsta acción no se puede deshacer y Meta cobrará por cada mensaje entregado.`
    );
    
    if (!confirmar) return;

    setLoading(true);
    setResultado(null);

    try {
      // Reemplazá esto por la URL real de tu servidor en Render (sin la barra / al final)
      const URL_BACKEND = 'https://supercompra-bot-backend.onrender.com';
      
      const response = await fetch(`${URL_BACKEND}/api/difusion`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ templateName }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Error al enviar la difusión');
      }

      // 3. Mostramos el resultado exitoso
      setResultado(data);
      setTemplateName(''); // Limpiamos el input
      
    } catch (error: any) {
      console.error(error);
      alert('Hubo un problema: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="contenedor-pagina">
      <Link href="/" className="link-volver">
        🔙 Volver al panel principal
      </Link>

      <div className="encabezado-pagina" style={{ marginTop: '20px' }}>
        <h1 className="titulo-pagina">📢 Campañas y Difusiones</h1>
      </div>

      <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', padding: '2rem', borderRadius: '8px', marginTop: '20px' }}>
        <h2 style={{ marginBottom: '10px', color: '#1f2937' }}>Enviar mensaje masivo (WhatsApp)</h2>
        <p style={{ marginBottom: '20px', color: '#4b5563', lineHeight: '1.5' }}>
          Escribí el nombre exacto de la plantilla (ej: <strong>promo_finde_20</strong>) previamente aprobada en tu panel de Meta. El sistema buscará a todos los clientes únicos en la base de datos y les enviará este mensaje.
        </p>
        
        <input 
          type="text" 
          placeholder="Nombre de la plantilla en Meta..." 
          value={templateName}
          onChange={(e) => setTemplateName(e.target.value)}
          className="input-tabla"
          style={{ width: '100%', padding: '0.8rem', marginBottom: '15px', fontSize: '1rem', border: '1px solid #ccc', borderRadius: '4px' }}
        />

        <button 
          onClick={enviarDifusion} 
          disabled={loading}
          className="btn btn-primario"
          style={{ padding: '0.8rem 1.5rem', fontSize: '1rem', width: '100%', backgroundColor: loading ? '#9ca3af' : '#2563eb', cursor: loading ? 'not-allowed' : 'pointer' }}
        >
          {loading ? '⏳ Procesando y enviando mensajes...' : '🚀 Disparar Difusión'}
        </button>

        {/* Tarjeta de reporte final */}
        {resultado && (
          <div style={{ marginTop: '25px', padding: '20px', background: '#dcfce7', border: '1px solid #bbf7d0', color: '#166534', borderRadius: '8px' }}>
            <h3 style={{ marginBottom: '15px', fontSize: '1.2rem' }}>✅ {resultado.mensaje}</h3>
            <ul style={{ paddingLeft: '20px', lineHeight: '1.8' }}>
              <li><strong>Total de clientes en base de datos:</strong> {resultado.total_clientes}</li>
              <li><strong>Mensajes despachados con éxito:</strong> {resultado.enviados}</li>
              <li><strong>Errores (números caídos o bloqueados):</strong> {resultado.fallidos}</li>
            </ul>
          </div>
        )}
      </div>
    </main>
  );
}