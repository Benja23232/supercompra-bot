'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import Link from 'next/link'; 

export default function Home() {
  const [productos, setProductos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Estados de edición
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [nuevoPrecio, setNuevoPrecio] = useState<number>(0);
  const [nuevoStock, setNuevoStock] = useState<number>(0);

  // Estados para crear nuevo producto
  const [mostrarFormulario, setMostrarFormulario] = useState(false);
  const [formNombre, setFormNombre] = useState('');
  const [formPrecio, setFormPrecio] = useState<number | ''>('');
  const [formStock, setFormStock] = useState<number | ''>('');

  async function fetchProductos() {
    setLoading(true);
    const { data, error } = await supabase
      .from('productos')
      .select('*')
      .order('nombre', { ascending: true });

    if (error) console.error('Error al traer productos:', error);
    else setProductos(data || []);
    
    setLoading(false);
  }

  useEffect(() => {
    fetchProductos();
  }, []);

  const activarEdicion = (prod: any) => {
    setEditandoId(prod.id_producto);
    setNuevoPrecio(prod.precio);
    setNuevoStock(prod.stock_fisico);
  };

  const guardarCambios = async (id: string) => {
    const { error } = await supabase
      .from('productos')
      .update({ precio: nuevoPrecio, stock_fisico: nuevoStock })
      .eq('id_producto', id);

    if (error) {
      alert('Error al actualizar. Revisá las políticas de UPDATE.');
    } else {
      setEditandoId(null);
      fetchProductos();
    }
  };

  const crearProducto = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formNombre || formPrecio === '' || formStock === '') return;

    const { error } = await supabase
      .from('productos')
      .insert([
        { 
          nombre: formNombre, 
          precio: Number(formPrecio), 
          stock_fisico: Number(formStock) 
        }
      ]);

    if (error) {
      alert('Error al crear. ¿Activaste la política de INSERT en Supabase?');
      console.error(error);
    } else {
      setFormNombre('');
      setFormPrecio('');
      setFormStock('');
      setMostrarFormulario(false);
      fetchProductos();
    }
  };

  return (
    <main className="contenedor-pagina">
      
      <Link href="/" className="link-volver">
        🔙 Volver al panel principal
      </Link>

      <div className="encabezado-pagina">
        <h1 className="titulo-pagina">📦 Panel de Gestión de Stock</h1>
        <div className="grupo-botones">
          <button 
            onClick={() => setMostrarFormulario(!mostrarFormulario)} 
            className="btn btn-primario"
          >
            {mostrarFormulario ? '❌ Cancelar' : '➕ Nuevo Producto'}
          </button>
          <button 
            onClick={fetchProductos} 
            className="btn btn-secundario"
          >
            🔄 Sincronizar
          </button>
        </div>
      </div>

      {/* Formulario de Alta */}
      {mostrarFormulario && (
        <form onSubmit={crearProducto} className="formulario-nuevo">
          <div className="campo-form grow">
            <label className="label-form">Nombre del producto</label>
            <input 
              type="text" required
              value={formNombre} onChange={(e) => setFormNombre(e.target.value)}
              className="input-form"
              placeholder="Ej: Alfajor Jorgito"
            />
          </div>
          <div className="campo-form num">
            <label className="label-form">Precio ($)</label>
            <input 
              type="number" required min="0"
              value={formPrecio} onChange={(e) => setFormPrecio(e.target.value === '' ? '' : Number(e.target.value))}
              className="input-form"
            />
          </div>
          <div className="campo-form num">
            <label className="label-form">Stock inicial</label>
            <input 
              type="number" required min="0"
              value={formStock} onChange={(e) => setFormStock(e.target.value === '' ? '' : Number(e.target.value))}
              className="input-form"
            />
          </div>
          <button type="submit" className="btn btn-exito btn-form">
            Guardar
          </button>
        </form>
      )}
      
      {loading ? (
        <p className="texto-cargando">Cargando datos del inventario...</p>
      ) : (
        <div className="contenedor-tabla">
          <table className="tabla-datos">
            <thead>
              <tr>
                <th className="texto-izq">Producto</th>
                <th className="texto-centro">Precio</th>
                <th className="texto-centro">Stock Físico</th>
                <th className="texto-centro">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {productos.map((prod) => {
                const esEditando = editandoId === prod.id_producto;
                
                return (
                  <tr key={prod.id_producto}>
                    <td className="font-fuerte">{prod.nombre}</td>
                    
                    <td className="texto-centro">
                      {esEditando ? (
                        <input
                          type="number"
                          value={nuevoPrecio}
                          onChange={(e) => setNuevoPrecio(parseFloat(e.target.value) || 0)}
                          className="input-tabla"
                        />
                      ) : (
                        `$${prod.precio}`
                      )}
                    </td>
                    
                    <td className="texto-centro">
                      {esEditando ? (
                        <input
                          type="number"
                          value={nuevoStock}
                          onChange={(e) => setNuevoStock(parseInt(e.target.value) || 0)}
                          className="input-tabla corto"
                        />
                      ) : (
                        <span className={prod.stock_fisico > 0 ? 'badge badge-verde' : 'badge badge-rojo'}>
                          {prod.stock_fisico} u.
                        </span>
                      )}
                    </td>
                    
                    <td className="texto-centro">
                      {esEditando ? (
                        <div className="grupo-botones-centro">
                          <button
                            onClick={() => guardarCambios(prod.id_producto)}
                            className="btn-chico btn-exito"
                          >
                            Guardar
                          </button>
                          <button
                            onClick={() => setEditandoId(null)}
                            className="btn-chico btn-peligro"
                          >
                            Cancelar
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => activarEdicion(prod)}
                          className="btn-texto"
                        >
                          ✏️ Editar
                        </button>
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