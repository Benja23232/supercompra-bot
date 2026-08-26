'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import Link from 'next/link'; 

export default function Productos() {
  const router = useRouter();
  const [autorizado, setAutorizado] = useState(false);
  const [productos, setProductos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [subiendo, setSubiendo] = useState(false);
  
  // Estados de edición general (Nombre y Precio)
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [editNombre, setEditNombre] = useState('');
  const [editPrecio, setEditPrecio] = useState<number>(0);

  const [loteProductoId, setLoteProductoId] = useState<string | null>(null);
  const [loteCant, setLoteCant] = useState<number | ''>('');
  const [loteFecha, setLoteFecha] = useState('');

  // Formulario Producto Normal
  const [mostrarFormulario, setMostrarFormulario] = useState(false);
  const [formNombre, setFormNombre] = useState('');
  const [formPrecio, setFormPrecio] = useState<number | ''>('');
  const [formStock, setFormStock] = useState<number | ''>('');
  const [formArchivo, setFormArchivo] = useState<File | null>(null);
  const [formVencimiento, setFormVencimiento] = useState(''); 

  // Formulario Combos/Promos
  const [mostrarFormCombo, setMostrarFormCombo] = useState(false);
  const [comboItems, setComboItems] = useState<{id_producto: string, nombre: string, cantidad: number}[]>([]);
  const [productoSeleccionado, setProductoSeleccionado] = useState('');
  const [cantidadSeleccionada, setCantidadSeleccionada] = useState<number>(1);

  async function fetchProductos() {
    setLoading(true);
    const { data, error } = await supabase
      .from('productos')
      .select(`*, lotes ( id_lote, cantidad, fecha_vencimiento )`);

    if (error) {
      console.error('Error al traer productos:', error);
    } else if (data) {
      const procesados = data.map(p => {
        const lotesActivos = (p.lotes || []).filter((l: any) => l.cantidad > 0);
        lotesActivos.sort((a: any, b: any) => new Date(a.fecha_vencimiento).getTime() - new Date(b.fecha_vencimiento).getTime());
        const proximoVenc = lotesActivos.length > 0 ? new Date(lotesActivos[0].fecha_vencimiento).getTime() : Infinity;
        return { ...p, lotesActivos, proximoVenc };
      });
      procesados.sort((a, b) => {
        if (a.tipo === 'combo' && b.tipo !== 'combo') return 1;
        if (a.tipo !== 'combo' && b.tipo === 'combo') return -1;
        return a.proximoVenc - b.proximoVenc;
      });
      setProductos(procesados);
    }
    setLoading(false);
  }

  useEffect(() => {
    const rol = localStorage.getItem('rolUsuario');
    if (rol === 'admin') {
      setAutorizado(true); 
      fetchProductos(); 
    } else {
      router.push('/'); 
    }
  }, [router]);

  const activarEdicion = (prod: any) => {
    setEditandoId(prod.id_producto);
    setEditNombre(prod.nombre);
    setEditPrecio(prod.precio);
  };

  const guardarEdicion = async (id: string) => {
    const res = await fetch('/api/productos', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id_producto: id, nombre: editNombre, precio: editPrecio })
    });
    const data = await res.json();
    if (!res.ok || !data.success) alert("Error al actualizar");
    setEditandoId(null);
    fetchProductos();
  };

  const toggleActivo = async (prod: any) => {
    const nuevoEstado = prod.activo === false ? true : false;
    const accionTexto = nuevoEstado ? 'mostrar' : 'ocultar';
    
    if (!confirm(`¿Estás seguro de ${accionTexto} "${prod.nombre}"?`)) return;

    const res = await fetch('/api/productos', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id_producto: prod.id_producto, activo: nuevoEstado })
    });

    const data = await res.json();
    if (res.ok && data.success) {
      fetchProductos();
    } else {
      alert("Error al cambiar estado");
    }
  };

  const activarCargaLote = (id: string) => { setLoteProductoId(id); setLoteCant(''); setLoteFecha(''); };
  const guardarNuevoLote = async (id: string) => {
    if (loteCant === '' || loteFecha === '') return;
    await fetch('/api/lotes', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id_producto: id, cantidad: Number(loteCant), fecha_vencimiento: loteFecha })
    });
    setLoteProductoId(null); fetchProductos();
  };

  const crearProducto = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubiendo(true);
    let imageUrl = '';
    if (formArchivo) {
      const nombreArchivo = `${Date.now()}_${formArchivo.name.replace(/[^a-zA-Z0-9]/g, '_')}`;
      await supabase.storage.from('productos').upload(nombreArchivo, formArchivo);
      imageUrl = supabase.storage.from('productos').getPublicUrl(nombreArchivo).data.publicUrl;
    }
    await fetch('/api/productos', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nombre: formNombre, precio: Number(formPrecio), stock_fisico: Number(formStock), image_url: imageUrl, fecha_vencimiento: formVencimiento })
    });
    setFormNombre(''); setFormPrecio(''); setFormStock(''); setFormVencimiento(''); setFormArchivo(null);
    setMostrarFormulario(false); fetchProductos(); setSubiendo(false);
  };

  const agregarItemCombo = () => {
    if (!productoSeleccionado) return;
    const prod = productos.find(p => p.id_producto === productoSeleccionado);
    if (!prod) return;
    setComboItems([...comboItems, { id_producto: prod.id_producto, nombre: prod.nombre, cantidad: cantidadSeleccionada }]);
    setProductoSeleccionado(''); setCantidadSeleccionada(1);
  };
  const eliminarItemCombo = (index: number) => {
    const nuevos = [...comboItems];
    nuevos.splice(index, 1);
    setComboItems(nuevos);
  };

  const crearCombo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (comboItems.length === 0) return alert("Agregá al menos un producto al combo.");
    setSubiendo(true);
    
    let imageUrl = '';
    if (formArchivo) {
      const nombreArchivo = `${Date.now()}_promo_${formArchivo.name.replace(/[^a-zA-Z0-9]/g, '_')}`;
      await supabase.storage.from('productos').upload(nombreArchivo, formArchivo);
      imageUrl = supabase.storage.from('productos').getPublicUrl(nombreArchivo).data.publicUrl;
    }

    await fetch('/api/combos', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nombre: formNombre, precio: Number(formPrecio), image_url: imageUrl, productos_combo: comboItems })
    });

    setFormNombre(''); setFormPrecio(''); setComboItems([]); setFormArchivo(null);
    setMostrarFormCombo(false); fetchProductos(); setSubiendo(false);
  };

  if (!autorizado) return <p>Cargando...</p>;

  const productosUnitarios = productos.filter(p => p.tipo !== 'combo');

  return (
    <main className="contenedor-pagina">
      <Link href="/dashboard" className="link-volver">🔙 Volver al panel principal</Link>

      <div className="encabezado-pagina">
        <h1 className="titulo-pagina">📦 Depósito y Promos</h1>
        <div className="grupo-botones">
          <button onClick={() => {setMostrarFormulario(!mostrarFormulario); setMostrarFormCombo(false);}} className="btn btn-primario">
            {mostrarFormulario ? '❌ Cancelar' : '➕ Producto Individual'}
          </button>
          <button onClick={() => {setMostrarFormCombo(!mostrarFormCombo); setMostrarFormulario(false);}} className="btn btn-exito">
            {mostrarFormCombo ? '❌ Cancelar' : '✨ Crear Promo/Combo'}
          </button>
        </div>
      </div>

      {mostrarFormulario && (
        <form onSubmit={crearProducto} className="formulario-nuevo" style={{ flexWrap: 'wrap' }}>
          <h3 style={{width: '100%', marginBottom: '10px'}}>Alta de Producto Individual</h3>
          <div className="campo-form grow"><label className="label-form">Nombre</label><input type="text" required value={formNombre} onChange={(e) => setFormNombre(e.target.value)} className="input-form"/></div>
          <div className="campo-form num"><label className="label-form">Precio ($)</label><input type="number" required min="0" step="0.01" value={formPrecio} onChange={(e) => setFormPrecio(Number(e.target.value))} className="input-form"/></div>
          <div className="campo-form num"><label className="label-form">Stock Inicial</label><input type="number" required min="0" value={formStock} onChange={(e) => setFormStock(Number(e.target.value))} className="input-form"/></div>
          <div className="campo-form num"><label className="label-form">Vence el:</label><input type="date" required value={formVencimiento} onChange={(e) => setFormVencimiento(e.target.value)} className="input-form"/></div>
          <div className="campo-form grow" style={{ width: '100%' }}><label className="label-form">Foto</label><input type="file" accept="image/*" onChange={(e) => setFormArchivo(e.target.files ? e.target.files[0] : null)} className="input-form"/></div>
          <button type="submit" className="btn btn-primario btn-form" style={{ width: '100%' }} disabled={subiendo}>{subiendo ? 'Guardando...' : 'Guardar Producto'}</button>
        </form>
      )}

      {mostrarFormCombo && (
        <form onSubmit={crearCombo} className="formulario-nuevo" style={{ flexWrap: 'wrap', backgroundColor: '#fffbe1', borderColor: '#fef08a' }}>
          <h3 style={{width: '100%', marginBottom: '10px', color: '#854d0e'}}>✨ Armar Promoción / Combo</h3>
          <div className="campo-form grow"><label className="label-form">Nombre de la Promo</label><input type="text" required value={formNombre} onChange={(e) => setFormNombre(e.target.value)} className="input-form" placeholder="Ej: 2x1 Alfajor Jorgito"/></div>
          <div className="campo-form num"><label className="label-form">Precio Final ($)</label><input type="number" required min="0" step="0.01" value={formPrecio} onChange={(e) => setFormPrecio(Number(e.target.value))} className="input-form"/></div>
          <div className="campo-form grow" style={{ width: '100%' }}><label className="label-form">Imagen Promocional</label><input type="file" accept="image/*" onChange={(e) => setFormArchivo(e.target.files ? e.target.files[0] : null)} className="input-form"/></div>

          <div style={{width: '100%', padding: '15px', background: '#fff', borderRadius: '8px', border: '1px dashed #ccc', margin: '10px 0'}}>
            <label className="label-form font-fuerte">Productos que componen este combo:</label>
            <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
              <select value={productoSeleccionado} onChange={(e) => setProductoSeleccionado(e.target.value)} className="input-form" style={{flexGrow: 1}}>
                <option value="">-- Seleccionar producto --</option>
                {productosUnitarios.map(p => <option key={p.id_producto} value={p.id_producto}>{p.nombre}</option>)}
              </select>
              <input type="number" min="1" value={cantidadSeleccionada} onChange={(e) => setCantidadSeleccionada(Number(e.target.value))} className="input-form" style={{width: '80px'}}/>
              <button type="button" onClick={agregarItemCombo} className="btn btn-secundario">Agregar</button>
            </div>
            
            <ul style={{marginTop: '15px', listStyle: 'none', padding: 0}}>
              {comboItems.map((item, index) => (
                <li key={index} style={{padding: '8px', background: '#f3f4f6', marginBottom: '5px', borderRadius: '5px', display: 'flex', justifyContent: 'space-between'}}>
                  <span>✔️ {item.cantidad}x <b>{item.nombre}</b></span>
                  <button type="button" onClick={() => eliminarItemCombo(index)} style={{color: 'red', cursor: 'pointer', background: 'none', border: 'none'}}>✖</button>
                </li>
              ))}
            </ul>
          </div>

          <button type="submit" className="btn btn-exito btn-form" style={{ width: '100%' }} disabled={subiendo}>{subiendo ? 'Guardando...' : 'Crear Promo y Publicar en WhatsApp'}</button>
        </form>
      )}
      
      {loading ? <p className="texto-cargando">Cargando...</p> : (
        <div className="contenedor-tabla">
          <table className="tabla-datos">
            <thead>
              <tr>
                <th className="texto-izq">Producto / Promo</th>
                <th className="texto-centro">Precio</th>
                <th className="texto-izq">Depósito / Receta</th>
                <th className="texto-centro">Stock Físico</th>
                <th className="texto-centro">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {productos.map((prod) => {
                const esEditando = editandoId === prod.id_producto;
                const esAgregandoLote = loteProductoId === prod.id_producto;
                const esCombo = prod.tipo === 'combo';
                const estaOculto = prod.activo === false;
                
                return (
                  <tr key={prod.id_producto} style={{ opacity: estaOculto ? 0.4 : 1, backgroundColor: esCombo ? '#131111' : 'transparent' }}>
                    <td className="font-fuerte">
                      {esCombo && "✨ "}
                      {esEditando ? (
                        <input type="text" value={editNombre} onChange={(e) => setEditNombre(e.target.value)} className="input-tabla" style={{width: '100%'}}/>
                      ) : (
                        <span>{prod.nombre} {estaOculto && " 🙈 (Oculto)"}</span>
                      )}
                    </td>
                    
                    <td className="texto-centro">
                      {esEditando ? (
                        <input type="number" step="0.01" value={editPrecio} onChange={(e) => setEditPrecio(parseFloat(e.target.value) || 0)} className="input-tabla corto"/>
                      ) : `$${prod.precio}`}
                    </td>
                    
                    <td className="texto-izq">
                      {esCombo ? (
                        <span style={{ fontSize: '0.85rem', color: '#854d0e', fontStyle: 'italic' }}>Promo / Combo activo</span>
                      ) : (
                        <>
                          {prod.lotesActivos?.length > 0 ? (
                            prod.lotesActivos.map((l: any, index: number) => (
                              <div key={l.id_lote} style={{ fontSize: '0.85rem', color: index === 0 ? '#b91c1c' : '#4b5563', fontWeight: index === 0 ? 'bold' : 'normal' }}>
                                {index === 0 && '⚠️ '} {l.cantidad} u. ➡️ {l.fecha_vencimiento.split('-').reverse().join('/')}
                              </div>
                            ))
                          ) : <span style={{ color: '#9ca3af', fontSize: '0.85rem' }}>Sin lotes activos</span>}

                          {esAgregandoLote && (
                            <div style={{ marginTop: '10px', display: 'flex', gap: '5px' }}>
                              <input type="number" placeholder="Cant." value={loteCant} onChange={(e) => setLoteCant(Number(e.target.value))} className="input-tabla corto"/>
                              <input type="date" value={loteFecha} onChange={(e) => setLoteFecha(e.target.value)} className="input-tabla"/>
                              <button onClick={() => guardarNuevoLote(prod.id_producto)} className="btn-chico btn-exito">✔</button>
                              <button onClick={() => setLoteProductoId(null)} className="btn-chico btn-peligro">✖</button>
                            </div>
                          )}
                        </>
                      )}
                    </td>

                    <td className="texto-centro">
                      {esCombo ? <span className="badge badge-verde">Promo</span> : <span className={prod.stock_fisico > 0 ? 'badge badge-verde' : 'badge badge-rojo'}>{prod.stock_fisico} u.</span>}
                    </td>
                    
                    <td className="texto-centro">
                      {!esEditando && !esAgregandoLote && (
                        <div className="grupo-botones-centro" style={{gap: '4px'}}>
                           {!esCombo && <button onClick={() => activarCargaLote(prod.id_producto)} className="btn-chico btn-primario">+ Lote</button>}
                           <button onClick={() => activarEdicion(prod)} className="btn-chico btn-secundario">✏️ Editar</button>
                           <button onClick={() => toggleActivo(prod)} className="btn-chico" style={{backgroundColor: estaOculto ? '#16a34a' : '#ca8a04', color: '#fff'}}>
                             {estaOculto ? '👁️ Mostrar' : '🙈 Ocultar'}
                           </button>
                        </div>
                      )}
                      {esEditando && (
                        <div className="grupo-botones-centro">
                          <button onClick={() => guardarEdicion(prod.id_producto)} className="btn-chico btn-exito">Guardar</button>
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