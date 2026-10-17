'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import Link from 'next/link'; 

// Categorías (extraídas de tu base de datos)
const CATEGORIAS = [
  'Aceites y Vinagres',
  'Almacén',
  'Almacén y Varios',
  'Bebidas con Alcohol',
  'Bebidas Sin Alcohol',
  'Café, Té y Chocolates',
  'Combos y Ofertas',
  'Condimentos en Sobre',
  'Conservas y frutas en almíbar',
  'Cuidado Personal',
  'Fideos, Arroz y Harinas',
  'Galletitas Dulces',
  'Galletitas Saladas y Bizcochos',
  'Gaseosas y Aguas',
  'Golosinas y Postres',
  'Higiene dental',
  'Infusiones',
  'Insecticidas',
  'Jugos Tang',
  'Jugos y Saborizadas',
  'Lácteos y Snacks',
  'Limpieza',
  'Limpieza - Cocina y Vajilla',
  'Limpieza - Desinfectantes y Pisos',
  'Limpieza - Ropa',
  'Limpieza - Utensilios y Accesorios',
  'Limpieza - Varios',
  'Papelería',
  'Repostería y Dulces',
  'Salsas y Conservas',
  'Yerba Mate',
];

// Rubros (extraídos de tu base de datos)
const RUBROS = [
  'Almacén y Conservas',
  'Bebidas e Infusiones',
  'Combos y Ofertas',
  'Cuidado Personal e Higiene',
  'Galletitas y Snacks',
  'Limpieza del Hogar',
  'Papelería e Insecticidas',
];

export default function Productos() {
  const router = useRouter();
  const [autorizado, setAutorizado] = useState(false);
  const [productos, setProductos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [subiendo, setSubiendo] = useState(false);
  
  // Estado para el filtro de categorías y búsqueda por nombre
  const [categoriaActiva, setCategoriaActiva] = useState('Todas');
  const [busqueda, setBusqueda] = useState('');

  // Estado para simular/recordar a cuáles les subimos foto en esta sesión
  const [fotosRecientes, setFotosRecientes] = useState<string[]>([]);

  // Estados de edición general (Nombre, Precio, Foto, Categoría y Rubro)
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [editNombre, setEditNombre] = useState('');
  const [editPrecio, setEditPrecio] = useState<number>(0);
  const [editArchivo, setEditArchivo] = useState<File | null>(null);
  const [editCategoria, setEditCategoria] = useState('');
  const [editRubro, setEditRubro] = useState('');

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
  const [formCategoria, setFormCategoria] = useState('Almacén y Varios');
  const [formRubro, setFormRubro] = useState('');

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
        
        lotesActivos.sort((a: any, b: any) => {
          if (!a.fecha_vencimiento) return 1;
          if (!b.fecha_vencimiento) return -1;
          return new Date(a.fecha_vencimiento).getTime() - new Date(b.fecha_vencimiento).getTime();
        });

        const proximoVenc = lotesActivos.length > 0 && lotesActivos[0].fecha_vencimiento 
          ? new Date(lotesActivos[0].fecha_vencimiento).getTime() 
          : Infinity;

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
    setEditArchivo(null);
    setEditCategoria(prod.categoria || '');
    setEditRubro(prod.rubro || '');
  };

  const guardarEdicion = async (id: string) => {
    setSubiendo(true);
    let imageUrl = undefined;
    let fotoSubida = false;

    if (editArchivo) {
      const nombreArchivo = `${Date.now()}_${editArchivo.name.replace(/[^a-zA-Z0-9]/g, '_')}`;
      const { error: uploadError } = await supabase.storage.from('productos').upload(nombreArchivo, editArchivo);
      
      if (!uploadError) {
        imageUrl = supabase.storage.from('productos').getPublicUrl(nombreArchivo).data.publicUrl;
        fotoSubida = true;
      } else {
        console.error('Error al subir la imagen en edición:', uploadError);
        alert('Error al subir la imagen. Guardando los demás datos.');
      }
    }

    const payload: any = { 
      id_producto: id, 
      nombre: editNombre, 
      precio: editPrecio,
      categoria: editCategoria,
      rubro: editRubro
    };
    if (imageUrl) {
      payload.image_url = imageUrl;
    }

    const res = await fetch('/api/productos', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (!res.ok || !data.success) {
      alert("Error al actualizar");
    } else {
      alert(`✅ "${editNombre}" se actualizó correctamente`);
      if (fotoSubida) {
        setFotosRecientes(prev => [...prev, String(id)]);
      }
    }
    
    setEditandoId(null);
    setEditArchivo(null);
    setSubiendo(false);
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
    if (loteCant === '') return;
    await fetch('/api/lotes', {
      method: 'POST', 
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        id_producto: id, 
        cantidad: Number(loteCant), 
        fecha_vencimiento: loteFecha ? loteFecha : null 
      })
    });
    setLoteProductoId(null); 
    fetchProductos();
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
    const nombreCreado = formNombre;
    const res = await fetch('/api/productos', {
      method: 'POST', 
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        nombre: formNombre, 
        precio: Number(formPrecio), 
        stock_fisico: Number(formStock), 
        image_url: imageUrl, 
        fecha_vencimiento: formVencimiento ? formVencimiento : null,
        categoria: formCategoria,
        rubro: formRubro
      })
    });

    const data = await res.json();
    if (!res.ok || data?.success === false) {
      alert("Error al crear el producto");
    } else {
      alert(`✅ "${nombreCreado}" se creó correctamente`);
    }

    setFormNombre(''); setFormPrecio(''); setFormStock(''); setFormVencimiento(''); setFormArchivo(null); setFormCategoria('Almacén y Varios'); setFormRubro('');
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

    const nombreCreado = formNombre;
    const res = await fetch('/api/combos', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nombre: formNombre, precio: Number(formPrecio), image_url: imageUrl, productos_combo: comboItems, categoria: 'Combos y Ofertas' })
    });

    const data = await res.json();
    if (!res.ok || data?.success === false) {
      alert("Error al crear la promo");
    } else {
      alert(`✅ La promo "${nombreCreado}" se creó correctamente`);
    }

    setFormNombre(''); setFormPrecio(''); setComboItems([]); setFormArchivo(null);
    setMostrarFormCombo(false); fetchProductos(); setSubiendo(false);
  };

  if (!autorizado) return <p>Cargando...</p>;

  const productosUnitarios = productos.filter(p => p.tipo !== 'combo');

  // Lógica para categorías y conteos
  const categoriasUnicas = ['Todas', ...Array.from(new Set(productos.map(p => p.categoria || 'Sin asignar')))];
  
  const getCategoriaTexto = (cat: string) => {
    if (cat === 'Todas') return `Todas (${productos.length})`;
    const cantidad = productos.filter(p => (p.categoria || 'Sin asignar') === cat).length;
    return `${cat} (${cantidad})`;
  };

  // Filtrado combinado: Categoría Activa + Buscador por Nombre
  const productosFiltrados = productos.filter(p => {
    const coincideCategoria = categoriaActiva === 'Todas' || (p.categoria || 'Sin asignar') === categoriaActiva;
    const coincideNombre = (p.nombre || '').toLowerCase().includes(busqueda.toLowerCase().trim());
    return coincideCategoria && coincideNombre;
  });

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
          
          <div className="campo-form num">
            <label className="label-form">Vence el (Opcional):</label>
            <input type="date" value={formVencimiento} onChange={(e) => setFormVencimiento(e.target.value)} className="input-form"/>
          </div>

          <div className="campo-form grow">
            <label className="label-form">Categoría</label>
            <select value={formCategoria} onChange={(e) => setFormCategoria(e.target.value)} className="input-form" required>
              {CATEGORIAS.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          <div className="campo-form grow">
            <label className="label-form">Rubro</label>
            <select value={formRubro} onChange={(e) => setFormRubro(e.target.value)} className="input-form">
              <option value="">-- Sin asignar --</option>
              {RUBROS.map(r => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </div>

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

      {/* Buscador de Productos por Nombre */}
      {!loading && productos.length > 0 && (
        <div style={{ marginBottom: '15px' }}>
          <div style={{ position: 'relative', width: '100%', maxWidth: '400px' }}>
            <input
              type="text"
              placeholder="🔍 Buscar por nombre..."
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              className="input-form"
              style={{
                width: '100%',
                paddingRight: busqueda ? '35px' : '12px'
              }}
            />
            {busqueda && (
              <button
                onClick={() => setBusqueda('')}
                style={{
                  position: 'absolute',
                  right: '10px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: '#9ca3af',
                  fontSize: '1rem'
                }}
              >
                ✖
              </button>
            )}
          </div>
        </div>
      )}
      
      {/* Barra de pestañas para las categorías */}
      {!loading && productos.length > 0 && (
        <div style={{ 
          display: 'flex', 
          gap: '8px', 
          flexWrap: 'wrap',
          paddingBottom: '10px', 
          marginBottom: '15px' 
        }}>
          {categoriasUnicas.map(cat => (
            <button 
              key={cat}
              onClick={() => setCategoriaActiva(cat)}
              style={{
                padding: '6px 14px',
                borderRadius: '20px',
                border: categoriaActiva === cat ? 'none' : '1px solid #d1d5db',
                backgroundColor: categoriaActiva === cat ? '#2563eb' : '#fff',
                color: categoriaActiva === cat ? '#fff' : '#374151',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                fontWeight: categoriaActiva === cat ? '600' : '500',
                transition: 'all 0.2s',
                boxShadow: categoriaActiva === cat ? '0 2px 4px rgba(37, 99, 235, 0.2)' : 'none'
              }}
            >
              {getCategoriaTexto(cat)}
            </button>
          ))}
        </div>
      )}

      {loading ? <p className="texto-cargando">Cargando...</p> : (
        <div className="contenedor-tabla">
          {/* table-layout fijo + colgroup: así las columnas no se corren de ancho al pasar a modo edición */}
          <table className="tabla-datos" style={{ fontSize: '0.95rem', tableLayout: 'fixed', width: '100%' }}>
            <colgroup>
              <col style={{ width: '26%' }} />
              <col style={{ width: '14%' }} />
              <col style={{ width: '14%' }} />
              <col style={{ width: '9%' }} />
              <col style={{ width: '17%' }} />
              <col style={{ width: '8%' }} />
              <col style={{ width: '12%' }} />
            </colgroup>
            <thead>
              <tr>
                <th className="texto-izq" style={{ padding: '10px 12px' }}>Producto / Promo</th>
                <th className="texto-izq" style={{ padding: '10px 12px' }}>Categoría</th>
                <th className="texto-izq" style={{ padding: '10px 12px' }}>Rubro</th>
                <th className="texto-centro" style={{ padding: '10px 12px' }}>Precio</th>
                <th className="texto-izq" style={{ padding: '10px 12px' }}>Depósito / Receta</th>
                <th className="texto-centro" style={{ padding: '10px 12px' }}>Stock Físico</th>
                <th className="texto-centro" style={{ padding: '10px 12px' }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {productosFiltrados.map((prod) => {
                const esEditando = editandoId === prod.id_producto;
                const esAgregandoLote = loteProductoId === prod.id_producto;
                const esCombo = prod.tipo === 'combo';
                const estaOculto = prod.activo === false;
                
                return (
                  <tr key={prod.id_producto} style={{ opacity: estaOculto ? 0.4 : 1, backgroundColor: esCombo ? '#131111' : 'transparent' }}>
                    
                    <td className="font-fuerte" style={{ padding: '10px 12px', overflowWrap: 'break-word' }}>
                      {esCombo && "✨ "}
                      {esEditando ? (
                        <div style={{display: 'flex', flexDirection: 'column', gap: '6px'}}>
                          <input type="text" value={editNombre} onChange={(e) => setEditNombre(e.target.value)} className="input-tabla" style={{width: '100%', fontSize: '0.95rem', padding: '5px 8px', boxSizing: 'border-box'}}/>
                          <div style={{fontSize: '0.85rem', color: '#666'}}>
                            <label>Foto: </label>
                            <input type="file" accept="image/*" onChange={(e) => setEditArchivo(e.target.files ? e.target.files[0] : null)} style={{maxWidth: '100%', fontSize: '0.85rem'}}/>
                          </div>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                          <span>{prod.nombre} {estaOculto && " 🙈"}</span>
                          
                          {prod.precio > 0 ? (
                            <span style={{ fontSize: '0.75rem', padding: '3px 7px', backgroundColor: '#dcfce7', color: '#166534', borderRadius: '10px', border: '1px solid #bbf7d0', whiteSpace: 'nowrap' }}>
                              ✓ Precio OK
                            </span>
                          ) : (
                            <span style={{ fontSize: '0.75rem', padding: '3px 7px', backgroundColor: '#fee2e2', color: '#991b1b', borderRadius: '10px', border: '1px solid #fecaca', whiteSpace: 'nowrap' }}>
                              📸 Falta armar
                            </span>
                          )}
                          
                          {fotosRecientes.includes(String(prod.id_producto)) && (
                            <span style={{ fontSize: '0.75rem', padding: '3px 7px', backgroundColor: '#fef3c7', color: '#92400e', borderRadius: '10px', border: '1px solid #fde68a', whiteSpace: 'nowrap', fontWeight: 'bold' }}>
                              🎉 Foto subida
                            </span>
                          )}
                        </div>
                      )}
                    </td>

                    <td className="texto-izq" style={{ padding: '10px 12px', fontSize: '0.9rem', overflowWrap: 'break-word' }}>
                      {esEditando ? (
                        <select 
                          value={editCategoria} 
                          onChange={(e) => setEditCategoria(e.target.value)} 
                          className="input-tabla" 
                          style={{ fontSize: '0.9rem', padding: '5px 8px', width: '100%', boxSizing: 'border-box' }}
                        >
                          <option value="">-- Sin asignar --</option>
                          {CATEGORIAS.map(c => (
                            <option key={c} value={c}>{c}</option>
                          ))}
                        </select>
                      ) : (prod.categoria || '-')}
                    </td>

                    <td className="texto-izq" style={{ padding: '10px 12px', fontSize: '0.9rem', overflowWrap: 'break-word' }}>
                      {esEditando ? (
                        <select 
                          value={editRubro} 
                          onChange={(e) => setEditRubro(e.target.value)} 
                          className="input-tabla" 
                          style={{ fontSize: '0.9rem', padding: '5px 8px', width: '100%', boxSizing: 'border-box' }}
                        >
                          <option value="">-- Sin asignar --</option>
                          {RUBROS.map(r => (
                            <option key={r} value={r}>{r}</option>
                          ))}
                        </select>
                      ) : (prod.rubro || '-')}
                    </td>
                    
                    <td className="texto-centro" style={{ padding: '10px 12px' }}>
                      {esEditando ? (
                        <input type="number" step="0.01" value={editPrecio} onChange={(e) => setEditPrecio(parseFloat(e.target.value) || 0)} className="input-tabla corto" style={{ fontSize: '0.95rem', padding: '5px 8px', width: '100%', boxSizing: 'border-box' }}/>
                      ) : `$${prod.precio}`}
                    </td>
                    
                    <td className="texto-izq" style={{ padding: '10px 12px', overflowWrap: 'break-word' }}>
                      {esCombo ? (
                        <span style={{ fontSize: '0.9rem', color: '#854d0e', fontStyle: 'italic' }}>Promo / Combo</span>
                      ) : (
                        <>
                          {prod.lotesActivos?.length > 0 ? (
                            prod.lotesActivos.map((l: any, index: number) => (
                              <div key={l.id_lote} style={{ fontSize: '0.88rem', color: index === 0 ? '#b91c1c' : '#4b5563', fontWeight: index === 0 ? 'bold' : 'normal', lineHeight: '1.4' }}>
                                {index === 0 && '⚠️ '} {l.cantidad} u. {l.fecha_vencimiento ? `➡️ ${l.fecha_vencimiento.split('-').reverse().join('/')}` : ' (Sin venc.)'}
                              </div>
                            ))
                          ) : <span style={{ color: '#9ca3af', fontSize: '0.88rem' }}>Sin lotes activos</span>}

                          {esAgregandoLote && (
                            <div style={{ marginTop: '8px', display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                              <input type="number" placeholder="Cant." value={loteCant} onChange={(e) => setLoteCant(Number(e.target.value))} className="input-tabla corto" style={{ fontSize: '0.88rem', padding: '5px 7px', width: '70px' }}/>
                              <input type="date" value={loteFecha} onChange={(e) => setLoteFecha(e.target.value)} className="input-tabla" style={{ fontSize: '0.88rem', padding: '5px 7px' }}/>
                              <button onClick={() => guardarNuevoLote(prod.id_producto)} className="btn-chico btn-exito" style={{ fontSize: '0.88rem', padding: '5px 10px' }}>✔</button>
                              <button onClick={() => setLoteProductoId(null)} className="btn-chico btn-peligro" style={{ fontSize: '0.88rem', padding: '5px 10px' }}>✖</button>
                            </div>
                          )}
                        </>
                      )}
                    </td>

                    <td className="texto-centro" style={{ padding: '10px 12px', fontSize: '0.9rem' }}>
                      {esCombo ? <span className="badge badge-verde">Promo</span> : <span className={prod.stock_fisico > 0 ? 'badge badge-verde' : 'badge badge-rojo'}>{prod.stock_fisico} u.</span>}
                    </td>
                    
                    {/* Acciones: columna de ancho fijo (ver colgroup) y botones apilados en columna
                        en vez de en fila, así nunca empujan ni corren el resto de la tabla */}
                    <td className="texto-centro" style={{ padding: '10px 8px' }}>
                      {!esEditando && !esAgregandoLote && (
                        <div style={{display: 'flex', flexDirection: 'column', gap: '6px', alignItems: 'stretch'}}>
                           {!esCombo && <button onClick={() => activarCargaLote(prod.id_producto)} className="btn-chico btn-primario" style={{ fontSize: '0.8rem', padding: '5px 8px', width: '100%', boxSizing: 'border-box' }}>+ Lote</button>}
                           <button onClick={() => activarEdicion(prod)} className="btn-chico btn-secundario" style={{ fontSize: '0.8rem', padding: '5px 8px', width: '100%', boxSizing: 'border-box' }}>✏️ Editar</button>
                           <button onClick={() => toggleActivo(prod)} className="btn-chico" style={{ fontSize: '0.8rem', padding: '5px 8px', width: '100%', boxSizing: 'border-box', backgroundColor: estaOculto ? '#16a34a' : '#ca8a04', color: '#fff' }}>
                             {estaOculto ? '👁️ Mostrar' : '🙈 Ocultar'}
                           </button>
                        </div>
                      )}
                      {esEditando && (
                        <div style={{display: 'flex', flexDirection: 'column', gap: '6px', alignItems: 'stretch'}}>
                          <button onClick={() => guardarEdicion(prod.id_producto)} className="btn-chico btn-exito" disabled={subiendo} style={{ fontSize: '0.8rem', padding: '5px 8px', width: '100%', boxSizing: 'border-box' }}>{subiendo ? '...' : '💾 Guardar'}</button>
                          <button onClick={() => setEditandoId(null)} className="btn-chico btn-peligro" disabled={subiendo} style={{ fontSize: '0.8rem', padding: '5px 8px', width: '100%', boxSizing: 'border-box' }}>❌ Cancelar</button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
              {productosFiltrados.length === 0 && (
                <tr>
                  <td colSpan={7} className="texto-centro" style={{padding: '20px', color: '#6b7280', fontSize: '0.95rem'}}>
                    {busqueda ? `No se encontraron productos que coincidan con "${busqueda}".` : 'No hay productos en esta categoría.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}