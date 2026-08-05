'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import Link from 'next/link'; 
import { logAuditoria } from '@/lib/auditoria';

export default function Productos() {
  const router = useRouter();
  const [autorizado, setAutorizado] = useState(false);

  const [productos, setProductos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [subiendo, setSubiendo] = useState(false);
  
  // Estados de edición de precio
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [nuevoPrecio, setNuevoPrecio] = useState<number>(0);

  // Estados para ingresar NUEVO LOTE a un producto existente
  const [loteProductoId, setLoteProductoId] = useState<string | null>(null);
  const [loteCant, setLoteCant] = useState<number | ''>('');
  const [loteFecha, setLoteFecha] = useState('');

  // Estados para crear nuevo producto
  const [mostrarFormulario, setMostrarFormulario] = useState(false);
  const [formNombre, setFormNombre] = useState('');
  const [formPrecio, setFormPrecio] = useState<number | ''>('');
  const [formStock, setFormStock] = useState<number | ''>('');
  const [formArchivo, setFormArchivo] = useState<File | null>(null);
  const [formVencimiento, setFormVencimiento] = useState(''); 

  async function fetchProductos() {
    setLoading(true);
    // Traemos los productos junto con TODOS sus lotes
    const { data, error } = await supabase
      .from('productos')
      .select(`
        *,
        lotes ( id_lote, cantidad, fecha_vencimiento )
      `);

    if (error) {
      console.error('Error al traer productos:', error);
    } else if (data) {
      // PROCESAMOS Y ORDENAMOS POR VENCIMIENTO
      const procesados = data.map(p => {
        // Filtramos solo lotes que tengan unidades
        const lotesActivos = (p.lotes || []).filter((l: any) => l.cantidad > 0);
        
        // Ordenamos los lotes internamente por fecha
        lotesActivos.sort((a: any, b: any) => new Date(a.fecha_vencimiento).getTime() - new Date(b.fecha_vencimiento).getTime());
        
        // Agarramos la fecha más crítica de ese producto para ordenar la tabla general
        const proximoVenc = lotesActivos.length > 0 ? new Date(lotesActivos[0].fecha_vencimiento).getTime() : Infinity;

        return { ...p, lotesActivos, proximoVenc };
      });

      // Ordenamos la tabla completa (los que vencen antes aparecen arriba)
      procesados.sort((a, b) => a.proximoVenc - b.proximoVenc);
      setProductos(procesados);
    }
    
    setLoading(false);
  }

  useEffect(() => {
    const rol = localStorage.getItem('rolUsuario');
    if (!rol) {
      router.push('/'); 
    } else if (rol !== 'admin') {
      router.push('/pedidos'); 
    } else {
      setAutorizado(true); 
      fetchProductos(); 
    }
  }, [router]);

  const activarEdicion = (prod: any) => {
    setEditandoId(prod.id_producto);
    setNuevoPrecio(prod.precio);
  };

  const guardarCambioPrecio = async (id: string) => {
    const { error } = await supabase
      .from('productos')
      .update({ precio: nuevoPrecio })
      .eq('id_producto', id);

    if (error) {
      alert('Error al actualizar precio.');
    } else {
      setEditandoId(null);
      fetchProductos();
    }
  };

  const activarCargaLote = (id: string) => {
    setLoteProductoId(id);
    setLoteCant('');
    setLoteFecha('');
  };

  const guardarNuevoLote = async (id: string) => {
    if (loteCant === '' || loteFecha === '') return;

    try {
      const res = await fetch('/api/lotes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id_producto: id,
          cantidad: Number(loteCant),
          fecha_vencimiento: loteFecha
        })
      });

      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error);

      alert("¡Lote ingresado y sincronizado con el stock de WhatsApp!");
      setLoteProductoId(null);
      fetchProductos();
    } catch (err: any) {
      alert("Error al guardar lote: " + err.message);
    }
  };

  const crearProducto = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formNombre || formPrecio === '' || formStock === '') return;

    setSubiendo(true);
    try {
      let imageUrl = '';

      if (formArchivo) {
        const extension = formArchivo.name.split('.').pop();
        const nombreLimpio = formArchivo.name.replace(/[^a-zA-Z0-9]/g, '_');
        const nombreArchivo = `${Date.now()}_${nombreLimpio}.${extension}`;
        
        const { error: errorUpload } = await supabase.storage
          .from('productos')
          .upload(nombreArchivo, formArchivo, { cacheControl: '3600', upsert: false });

        if (errorUpload) throw new Error(errorUpload.message);

        const { data: publicUrlData } = supabase.storage.from('productos').getPublicUrl(nombreArchivo);
        imageUrl = publicUrlData.publicUrl;
      }

      const response = await fetch('/api/productos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nombre: formNombre,
          precio: Number(formPrecio),
          stock_fisico: Number(formStock),
          image_url: imageUrl,
          fecha_vencimiento: formVencimiento 
        })
      });

      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error);

      await logAuditoria('Productos', 'Nuevo Producto', `Alta "${formNombre.trim()}" sincronizado.`);

      alert("¡Producto creado!");
      setFormNombre(''); setFormPrecio(''); setFormStock(''); setFormVencimiento(''); setFormArchivo(null);
      setMostrarFormulario(false);
      fetchProductos();

    } catch (err: any) {
      alert("Hubo un error: " + err.message);
    } finally {
      setSubiendo(false);
    }
  };

  const formatearFecha = (fecha: string) => {
    if (!fecha) return '-';
    const partes = fecha.split('-');
    return `${partes[2]}/${partes[1]}/${partes[0]}`;
  };

  if (!autorizado) return <p>Cargando...</p>;

  return (
    <main className="contenedor-pagina">
      
      <Link href="/dashboard" className="link-volver">🔙 Volver al panel principal</Link>

      <div className="encabezado-pagina">
        <h1 className="titulo-pagina">📦 Depósito y Vencimientos</h1>
        <div className="grupo-botones">
          <button onClick={() => setMostrarFormulario(!mostrarFormulario)} className="btn btn-primario">
            {mostrarFormulario ? '❌ Cancelar' : '➕ Nuevo Producto'}
          </button>
        </div>
      </div>

      {mostrarFormulario && (
        <form onSubmit={crearProducto} className="formulario-nuevo" style={{ flexWrap: 'wrap' }}>
          <div className="campo-form grow"><label className="label-form">Nombre</label><input type="text" required value={formNombre} onChange={(e) => setFormNombre(e.target.value)} className="input-form"/></div>
          <div className="campo-form num"><label className="label-form">Precio ($)</label><input type="number" required min="0" step="0.01" value={formPrecio} onChange={(e) => setFormPrecio(Number(e.target.value))} className="input-form"/></div>
          <div className="campo-form num"><label className="label-form">Stock Inicial</label><input type="number" required min="0" value={formStock} onChange={(e) => setFormStock(Number(e.target.value))} className="input-form"/></div>
          <div className="campo-form num"><label className="label-form">Vence el:</label><input type="date" required value={formVencimiento} onChange={(e) => setFormVencimiento(e.target.value)} className="input-form"/></div>
          <div className="campo-form grow" style={{ width: '100%' }}><label className="label-form">Foto</label><input type="file" accept="image/*" onChange={(e) => setFormArchivo(e.target.files ? e.target.files[0] : null)} className="input-form"/></div>
          <button type="submit" className="btn btn-exito btn-form" style={{ width: '100%' }} disabled={subiendo}>
            {subiendo ? 'Guardando...' : 'Guardar Producto'}
          </button>
        </form>
      )}
      
      {loading ? <p className="texto-cargando">Cargando depósito...</p> : (
        <div className="contenedor-tabla">
          <table className="tabla-datos">
            <thead>
              <tr>
                <th className="texto-izq">Producto</th>
                <th className="texto-centro">Precio</th>
                <th className="texto-izq">Lotes en Depósito (FIFO)</th>
                <th className="texto-centro">Stock Total</th>
                <th className="texto-centro">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {productos.map((prod) => {
                const esEditandoPrecio = editandoId === prod.id_producto;
                const esAgregandoLote = loteProductoId === prod.id_producto;
                
                return (
                  <tr key={prod.id_producto} style={prod.stock_fisico === 0 ? { opacity: 0.6 } : {}}>
                    <td className="font-fuerte">{prod.nombre}</td>
                    
                    <td className="texto-centro">
                      {esEditandoPrecio ? (
                        <input type="number" step="0.01" value={nuevoPrecio} onChange={(e) => setNuevoPrecio(parseFloat(e.target.value) || 0)} className="input-tabla corto"/>
                      ) : `$${prod.precio}`}
                    </td>
                    
                    <td className="texto-izq">
                      {/* Lista de lotes con sus fechas */}
                      {prod.lotesActivos.length > 0 ? (
                        prod.lotesActivos.map((l: any, index: number) => (
                          <div key={l.id_lote} style={{ fontSize: '0.85rem', color: index === 0 ? '#b91c1c' : '#4b5563', fontWeight: index === 0 ? 'bold' : 'normal' }}>
                            {index === 0 && '⚠️ Próximo a vencer: '}
                            {l.cantidad} u. ➡️ Vence: {formatearFecha(l.fecha_vencimiento)}
                          </div>
                        ))
                      ) : <span style={{ color: '#9ca3af', fontSize: '0.85rem' }}>Sin lotes activos</span>}

                      {/* Formulario para agregar un lote nuevo en esa fila */}
                      {esAgregandoLote && (
                        <div style={{ marginTop: '10px', display: 'flex', gap: '5px' }}>
                          <input type="number" placeholder="Cant." value={loteCant} onChange={(e) => setLoteCant(Number(e.target.value))} className="input-tabla corto"/>
                          <input type="date" value={loteFecha} onChange={(e) => setLoteFecha(e.target.value)} className="input-tabla"/>
                          <button onClick={() => guardarNuevoLote(prod.id_producto)} className="btn-chico btn-exito">✔</button>
                          <button onClick={() => setLoteProductoId(null)} className="btn-chico btn-peligro">✖</button>
                        </div>
                      )}
                    </td>

                    <td className="texto-centro">
                      <span className={prod.stock_fisico > 0 ? 'badge badge-verde' : 'badge badge-rojo'}>
                        {prod.stock_fisico} u.
                      </span>
                    </td>
                    
                    <td className="texto-centro">
                      {!esEditandoPrecio && !esAgregandoLote && (
                        <div className="grupo-botones-centro">
                           <button onClick={() => activarCargaLote(prod.id_producto)} className="btn-chico btn-primario">+ Lote</button>
                           <button onClick={() => activarEdicion(prod)} className="btn-chico btn-secundario">Editar Precio</button>
                        </div>
                      )}
                      {esEditandoPrecio && (
                        <div className="grupo-botones-centro">
                          <button onClick={() => guardarCambioPrecio(prod.id_producto)} className="btn-chico btn-exito">Guardar</button>
                          <button onClick={() => setEditandoId(null)} className="btn-chico btn-peligro">Cancelar</button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}