'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

/* ---------- Logo (vectorial) ---------- */
function CartIcon({ size = 56 }: { size?: number }) {
  return (
    <svg width={size} height={(size * 70) / 78} viewBox="152 254 78 70" aria-hidden="true">
      <path d="M158 270 L168 270 L176 304 L214 304" fill="none" stroke="#1B6B3A" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M180 278 L224 278 L220 290 L184 290 Z" fill="#C9922B" />
      <path d="M184 296 L212 296" stroke="#1B6B3A" strokeWidth="3" strokeLinecap="round" fill="none" />
      <circle cx="184" cy="314" r="4.8" fill="#1B6B3A" />
      <circle cx="210" cy="314" r="4.8" fill="#1B6B3A" />
      <path d="M184 270 Q200 257 217 265" fill="none" stroke="#C9922B" strokeWidth="3" strokeLinecap="round" />
      <path d="M213 258 L224 266 L212 271 Z" fill="#C9922B" />
    </svg>
  );
}

/* ---------- Categorías ---------- */
const CATEGORIAS = [
  { id: 'vinos', nombre: 'Vinos', icono: '🍷', palabras: ['vino', 'malbec', 'cabernet', 'merlot', 'syrah', 'chardonnay', 'torrontes', 'rosado', 'espumante', 'champ', 'sauvignon', 'pinot', 'tempranillo', 'bonarda', 'blend', 'tinto'] },
  { id: 'cervezas', nombre: 'Cervezas', icono: '🍺', palabras: ['cerveza', 'birra', 'ipa\\b', 'lager', 'stout', 'porter', 'pilsen', 'honey', 'quilmes', 'brahma', 'stella', 'andes', 'patagonia', 'corona', 'heineken', 'budweiser', 'imperial', 'schneider', 'isenbeck', 'warsteiner', 'amstel', 'miller', 'salta\\b'] },
  { id: 'aperitivos', nombre: 'Aperitivos', icono: '🍹', palabras: ['fernet', 'aperitivo', 'aperol', 'campari', 'cinzano', 'gancia', 'vermut', 'vermouth', 'branca', 'cynar', 'amargo', 'hesperidina'] },
  { id: 'destilados', nombre: 'Destilados y licores', icono: '🥃', palabras: ['whisky', 'whiskey', 'vodka', 'gin\\b', 'ginebra', 'ron\\b', 'tequila', 'licor', 'conac', 'bourbon', 'pisco', 'grappa', 'absolut', 'smirnoff', 'jack daniel', 'johnnie', 'chivas', 'old parr'] },
  { id: 'otros', nombre: 'Otras bebidas', icono: '🍾', palabras: [] as string[] },
];

const REGLAS = CATEGORIAS.filter(c => c.palabras.length > 0).map(c => ({
  id: c.id,
  re: new RegExp(`\\b(${c.palabras.join('|')})`),
}));

function clasificar(p: any): string {
  const texto = `${p.nombre ?? ''} ${p.categoria ?? ''} ${p.subcategoria ?? ''}`
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  return REGLAS.find(r => r.re.test(texto))?.id ?? 'otros';
}

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;700;800&display=swap');

.sc {
  --green: #1B6B3A;
  --green-deep: #123F26;
  --gold: #C9922B;
  --gold-soft: #F6E7C4;
  --cream: #F7F3E8;
  --paper: #FFFFFF;
  --ink: #1E2B23;
  --muted: #6B766F;
  --line: #E6E0CD;
  min-height: 100vh;
  background: var(--cream);
  color: var(--ink);
  font-family: 'Plus Jakarta Sans', system-ui, -apple-system, 'Segoe UI', sans-serif;
  padding-bottom: 120px;
}
.sc *, .sc *::before, .sc *::after { box-sizing: border-box; }
.sc button, .sc input { font-family: inherit; }

/* Cargando */
.sc-loading { min-height: 100vh; display: flex; flex-direction: column; gap: 14px; justify-content: center; align-items: center; background: #F7F3E8; color: #6B766F; }
.sc-spin { width: 34px; height: 34px; border-radius: 50%; border: 3px solid #E6E0CD; border-top-color: #1B6B3A; animation: sc-rot .8s linear infinite; }
@keyframes sc-rot { to { transform: rotate(360deg); } }

/* Cabecera */
.sc-head { background: var(--green-deep); color: #fff; padding: 22px 20px 64px; position: relative; }
.sc-head-in { max-width: 1000px; margin: 0 auto; display: flex; align-items: center; gap: 16px; }
.sc-badge { flex: none; width: 88px; height: 88px; border-radius: 50%; background: var(--cream); display: grid; place-items: center; box-shadow: 0 0 0 4px rgba(201,146,43,.55); }
.sc-brand { margin: 0; font-size: 1.8rem; font-weight: 800; letter-spacing: -0.02em; line-height: 1.1; }
.sc-brand b { color: var(--gold); font-weight: 800; }
.sc-sub { margin: 6px 0 0; font-size: .95rem; color: #CFE0D4; }
.sc-age { display: inline-block; margin-top: 10px; padding: 4px 12px; border-radius: 999px; background: rgba(201,146,43,.18); color: #F3D390; font-size: .85rem; font-weight: 700; }

/* Contenido */
.sc-wrap { max-width: 1000px; margin: -30px auto 0; padding: 0 20px; position: relative; }
.sc-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 16px; }

.sc-card { background: var(--paper); border: 1px solid var(--line); border-radius: 18px; overflow: hidden; display: flex; flex-direction: column; transition: transform 0.2s; }
.sc-card:hover { transform: translateY(-2px); box-shadow: 0 8px 16px rgba(0,0,0,0.05); }
.sc-thumb { aspect-ratio: 1 / 1; background-color: #F1EBD8; background-size: cover; background-position: center; display: grid; place-items: center; font-size: 2.5rem; position: relative; }
.sc-low { position: absolute; top: 10px; left: 10px; background: var(--gold-soft); color: #7A5612; font-size: .75rem; font-weight: 700; padding: 4px 10px; border-radius: 999px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
.sc-out { position: absolute; inset: 0; background: rgba(0,0,0,0.4); display: grid; place-items: center; color: #fff; font-weight: 800; font-size: .95rem; text-transform: uppercase; letter-spacing: .05em; }
.sc-body { padding: 16px; display: flex; flex-direction: column; justify-content: space-between; flex-grow: 1; gap: 16px; }
.sc-name { margin: 0; font-size: 1rem; font-weight: 700; line-height: 1.3; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.sc-price { margin: 4px 0 0; font-size: 1.3rem; font-weight: 800; color: var(--green); }

.sc-add { width: 100%; padding: 12px; border: none; border-radius: 12px; background: var(--green); color: #fff; font-weight: 700; font-size: .95rem; cursor: pointer; transition: background .15s; }
.sc-add:hover { background: var(--green-deep); }
.sc-add:disabled { background: #D1D8D3; color: #8A9990; cursor: not-allowed; }
.sc-step { display: flex; align-items: center; justify-content: space-between; background: var(--gold-soft); border-radius: 12px; padding: 5px; }
.sc-step button { width: 40px; height: 40px; border: none; border-radius: 9px; background: #fff; color: var(--green-deep); font-size: 1.4rem; font-weight: 700; cursor: pointer; line-height: 1; display: flex; align-items: center; justify-content: center; }
.sc-step button:hover { background: var(--green); color: #fff; }
.sc-step span { font-weight: 800; font-size: 1.1rem; min-width: 32px; text-align: center; }

/* Categorías corregidas y responsivas */
.sc-tabs { display: flex; gap: 8px; flex-wrap: wrap; padding: 4px 4px 12px; }
.sc-tabs button { flex: 0 1 auto; padding: 8px 16px; border-radius: 999px; border: 1.5px solid var(--line); background: #fff; color: var(--ink); font-weight: 700; font-size: .9rem; cursor: pointer; transition: all 0.2s; }
.sc-tabs button span { margin-left: 6px; font-weight: 500; opacity: .6; font-size: 0.9em; }
.sc-tabs button.on { background: var(--gold); border-color: var(--gold); color: #fff; box-shadow: 0 4px 10px rgba(201,146,43,.3); }
.sc-tabs button.on span { opacity: 1; }

.sc-sec { margin-top: 28px; }
.sc-sec-h { margin: 0 0 16px; font-size: 1.4rem; font-weight: 800; letter-spacing: -0.01em; display: flex; align-items: center; gap: 8px; }

.sc-empty { text-align: center; color: var(--muted); margin: 60px 0; font-size: 1.1rem; }

/* Formulario */
.sc-form-card { margin-top: 40px; background: var(--paper); border: 1px solid var(--line); border-radius: 24px; padding: 28px; max-width: 700px; margin-left: auto; margin-right: auto; box-shadow: 0 4px 20px rgba(0,0,0,0.03); }
.sc-form-card h2 { margin: 0 0 20px; font-size: 1.4rem; font-weight: 800; letter-spacing: -0.01em; }
.sc-form { display: flex; flex-direction: column; gap: 18px; }
.sc-label { display: block; margin-bottom: 8px; color: var(--muted); font-size: .9rem; font-weight: 600; }
.sc-input { width: 100%; padding: 14px 16px; border-radius: 12px; border: 1.5px solid var(--line); background: var(--cream); color: var(--ink); font-size: 16px !important; transition: all 0.2s; }
.sc-input:focus { outline: none; border-color: var(--gold); box-shadow: 0 0 0 3px rgba(201,146,43,.25); background: #fff; }
.sc-row { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
.sc-seg { display: flex; gap: 12px; flex-wrap: wrap; }
.sc-seg button { flex: 1 1 calc(50% - 12px); min-width: 140px; padding: 14px 10px; border-radius: 12px; border: 1.5px solid var(--line); background: var(--cream); color: var(--ink); font-weight: 700; font-size: .95rem; cursor: pointer; transition: all 0.2s; }
.sc-seg button.on { border-color: var(--green); background: var(--green); color: #fff; box-shadow: 0 4px 10px rgba(27,107,58,.2); }
.sc-submit { margin-top: 8px; padding: 16px; border: none; border-radius: 14px; background: var(--gold); color: #fff; font-weight: 800; font-size: 1.1rem; cursor: pointer; transition: background 0.2s; }
.sc-submit:hover:not(:disabled) { background: #B07D1E; }
.sc-submit:disabled { background: #B9BFB9; cursor: not-allowed; opacity: 0.8; }

/* Barra flotante */
.sc-bar { position: fixed; left: 0; right: 0; bottom: 0; z-index: 50; background: var(--green-deep); color: #fff; padding: 16px 20px calc(16px + env(safe-area-inset-bottom, 0px)); box-shadow: 0 -4px 20px rgba(0,0,0,0.15); }
.sc-bar-in { max-width: 1000px; margin: 0 auto; display: flex; align-items: center; justify-content: space-between; gap: 16px; }
.sc-bar-lbl { margin: 0; color: #CFE0D4; font-size: .9rem; }
.sc-bar-total { margin: 0; color: #F3D390; font-size: 1.5rem; font-weight: 800; }
.sc-bar button { padding: 14px 24px; border: none; border-radius: 12px; background: var(--gold); color: #fff; font-weight: 800; font-size: 1rem; cursor: pointer; transition: background 0.2s; }
.sc-bar button:hover { background: #B07D1E; }

/* Footer */
.sc-footer { margin-top: 60px; padding: 32px 20px; background: #123F26; color: #CFE0D4; border-top: 1px solid rgba(230,240,205,0.1); text-align: center; }
.sc-footer-in { max-width: 800px; margin: 0 auto; display: flex; flex-direction: column; gap: 12px; align-items: center; }
.sc-footer p { margin: 0; font-size: .95rem; line-height: 1.5; }
.sc-footer a { color: #F3D390; text-decoration: none; font-weight: 700; }
.sc-footer a:hover { text-decoration: underline; }
.sc-footer-brand { font-size: 1.1rem; font-weight: 800; color: #fff; }
.sc-footer-brand b { color: var(--gold); }

.sc button:focus-visible, .sc-add:focus-visible { outline: 3px solid var(--gold); outline-offset: 2px; }

/* ---------------- MEDIAS QUERIES RESPONSIVAS ---------------- */

@media (max-width: 900px) {
  .sc-grid { grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)); }
}

@media (max-width: 600px) {
  .sc-head { padding: calc(24px + env(safe-area-inset-top, 0px)) 16px 64px; }
  .sc-head-in { gap: 14px; }
  .sc-badge { width: 76px; height: 76px; }
  .sc-brand { font-size: 1.5rem; }
  .sc-sub { font-size: .9rem; }
  .sc-wrap { padding: 0 16px; margin-top: -32px; }
  .sc-tabs { padding: 4px 0 8px; }
  
  .sc-grid { grid-template-columns: 1fr 1fr; gap: 12px; }
  
  .sc-body { padding: 12px; gap: 12px; }
  .sc-name { font-size: .95rem; }
  .sc-price { font-size: 1.2rem; }
  .sc-add { padding: 10px; font-size: .9rem; }
  .sc-step button { width: 36px; height: 36px; font-size: 1.2rem; }
  .sc-step span { font-size: 1rem; min-width: 28px; }
  
  .sc-form-card { padding: 22px 18px; border-radius: 20px; }
  .sc-row { grid-template-columns: 1fr; gap: 12px; }
  .sc-seg { flex-direction: column; gap: 10px; }
  
  .sc-bar { padding: 14px 16px calc(14px + env(safe-area-inset-bottom, 0px)); }
  .sc-bar-total { font-size: 1.35rem; }
  .sc-bar button { padding: 12px 20px; font-size: .95rem; }
}

@media (max-width: 360px) {
  .sc-badge { width: 64px; height: 64px; }
  .sc-brand { font-size: 1.3rem; }
  .sc-grid { gap: 8px; }
  .sc-body { padding: 10px; gap: 10px; }
  .sc-name { font-size: .85rem; }
  .sc-price { font-size: 1.1rem; }
  .sc-step button { width: 32px; height: 32px; }
  .sc-bar button { padding: 12px 16px; font-size: .9rem; }
}
`;

export default function CatalogoBebidas() {
  const [productos, setProductos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [carrito, setCarrito] = useState<Record<string, number>>({});

  const [nombre, setNombre] = useState('');
  const [telefono, setTelefono] = useState('');
  const [entrega, setEntrega] = useState('retiro');
  const [direccion, setDireccion] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [filtro, setFiltro] = useState('todos');

  useEffect(() => {
    async function fetchBebidas() {
      const { data } = await supabase
        .from('productos')
        .select('*')
        .ilike('categoria', '%Alcohol%');

      if (data) {
        setProductos(data);
      }
      setLoading(false);
    }
    fetchBebidas();
  }, []);

  const agregar = (id: string) => {
    const prod = productos.find(p => p.id_producto === id);
    const cantActual = carrito[id] || 0;
    if (prod && prod.stock_fisico > 0 && cantActual < prod.stock_fisico) {
      setCarrito({ ...carrito, [id]: cantActual + 1 });
    }
  };

  const quitar = (id: string) => {
    setCarrito(prev => {
      const nuevo = { ...prev };
      if (nuevo[id] > 1) nuevo[id] -= 1;
      else delete nuevo[id];
      return nuevo;
    });
  };

  const total = Object.entries(carrito).reduce((acc, [id, cant]) => {
    const prod = productos.find(p => p.id_producto === id);
    return acc + (prod?.precio || 0) * cant;
  }, 0);

  const grupos = CATEGORIAS
    .map(c => ({ ...c, items: productos.filter(p => clasificar(p) === c.id) }))
    .filter(g => g.items.length > 0);
  const secciones = filtro === 'todos' ? grupos : grupos.filter(g => g.id === filtro);

  const enviarPedidoWeb = async (e: React.FormEvent) => {
    e.preventDefault();
    if (Object.keys(carrito).length === 0) return alert("El carrito está vacío");
    if (!telefono || !nombre) return alert("Por favor completá tu nombre y WhatsApp");
    if (entrega === 'envio' && !direccion) return alert("Por favor ingresá tu dirección");

    setEnviando(true);
    try {
      let telLimpio = telefono.replace(/[^0-9]/g, '');
      if (!telLimpio.startsWith('549')) telLimpio = `549${telLimpio}`;

      await supabase.from('clientes').upsert({ whatsapp_id: telLimpio, nombre: nombre }, { onConflict: 'whatsapp_id' });

      const estadoReal = entrega === 'retiro' ? 'Pendiente - Retiro' : 'Pendiente - Domicilio';
      const dirReal = entrega === 'retiro' ? 'Retiro en depósito (Mitre 1044)' : direccion;

      const { data: ped, error: errPed } = await supabase
        .from('pedidos')
        .insert({
          whatsapp_id: telLimpio,
          estado: estadoReal,
          total_compra: total,
          direccion: dirReal
        })
        .select('id_pedido')
        .single();

      if (errPed || !ped) throw new Error("Error creando el pedido");

      const detalles = Object.entries(carrito).map(([id, cant]) => {
        const prod = productos.find(p => p.id_producto === id);
        return {
          id_pedido: ped.id_pedido,
          id_producto: id,
          cantidad: cant,
          precio_congelado: prod?.precio || 0
        };
      });

      await supabase.from('detalle_pedidos').insert(detalles);

      const msj = `¡Hola! Acabo de hacer un pedido de bebidas por la web. 🍷🍻\n*Mi número de pedido es: #${ped.id_pedido}*\nPor favor, confirmame cuando lo empiecen a preparar.`;
      const urlWa = `https://wa.me/5492392000000?text=${encodeURIComponent(msj)}`;

      window.location.href = urlWa;

    } catch (error) {
      console.error(error);
      alert("Hubo un error al procesar tu pedido. Intentá de nuevo.");
      setEnviando(false);
    }
  };

  if (loading) {
    return (
      <div className="sc-loading">
        <style>{CSS}</style>
        <div className="sc-spin" />
        Cargando catálogo...
      </div>
    );
  }

  return (
    <main className="sc">
      <style>{CSS}</style>

      <header className="sc-head">
        <div className="sc-head-in">
          <div className="sc-badge"><CartIcon size={58} /></div>
          <div>
            <h1 className="sc-brand">Super<b>compras</b></h1>
            <p className="sc-sub">Bebidas · Tu compra online</p>
            <span className="sc-age">Solo mayores de 18 años</span>
          </div>
        </div>
      </header>

      <div className="sc-wrap">

        {/* CATEGORÍAS */}
        {productos.length > 0 && (
          <div className="sc-tabs">
            <button type="button" className={filtro === 'todos' ? 'on' : ''} onClick={() => setFiltro('todos')}>
              Todos <span>{productos.length}</span>
            </button>
            {grupos.map(g => (
              <button key={g.id} type="button" className={filtro === g.id ? 'on' : ''} onClick={() => setFiltro(g.id)}>
                {g.icono} {g.nombre} <span>{g.items.length}</span>
              </button>
            ))}
          </div>
        )}

        {/* GRILLA DE PRODUCTOS */}
        {secciones.map(sec => (
        <section key={sec.id} className="sc-sec">
        <h2 className="sc-sec-h">{sec.icono} {sec.nombre}</h2>
        <div className="sc-grid">
          {sec.items.map(p => {
            const cant = carrito[p.id_producto] || 0;
            const sinStock = p.stock_fisico <= 0;
            return (
              <div key={p.id_producto} className="sc-card">
                <div
                  className="sc-thumb"
                  style={p.image_url ? { backgroundImage: `url(${p.image_url})` } : undefined}
                >
                  {!p.image_url && '🍷'}
                  {sinStock && <div className="sc-out">Agotado</div>}
                  {!sinStock && p.stock_fisico <= 5 && <span className="sc-low">Quedan {p.stock_fisico}</span>}
                </div>
                <div className="sc-body">
                  <div>
                    <h3 className="sc-name">{p.nombre}</h3>
                    <p className="sc-price">${p.precio}</p>
                  </div>

                  {sinStock ? (
                    <button className="sc-add" disabled>Sin stock</button>
                  ) : cant > 0 ? (
                    <div className="sc-step">
                      <button onClick={() => quitar(p.id_producto)} aria-label="Quitar uno">−</button>
                      <span>{cant}</span>
                      <button onClick={() => agregar(p.id_producto)} aria-label="Agregar uno">+</button>
                    </div>
                  ) : (
                    <button className="sc-add" onClick={() => agregar(p.id_producto)}>Agregar</button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        </section>
        ))}

        {productos.length === 0 && <p className="sc-empty">No hay bebidas en stock por el momento.</p>}

        {/* FORMULARIO DE CHECKOUT */}
        {total > 0 && (
          <div className="sc-form-card">
            <h2>Tus datos</h2>
            <form onSubmit={enviarPedidoWeb} className="sc-form">
              <div className="sc-row">
              <div>
                <label className="sc-label">Nombre y apellido</label>
                <input className="sc-input" type="text" required value={nombre} onChange={e => setNombre(e.target.value)} />
              </div>
              <div>
                <label className="sc-label">Número de WhatsApp (Ej: 2392480035)</label>
                <input className="sc-input" type="tel" required value={telefono} onChange={e => setTelefono(e.target.value)} />
              </div>
              </div>

              <div>
                <label className="sc-label">¿Cómo lo recibís?</label>
                <div className="sc-seg">
                  <button type="button" className={entrega === 'retiro' ? 'on' : ''} onClick={() => setEntrega('retiro')}>🏪 Retiro (Mitre 1044)</button>
                  <button type="button" className={entrega === 'envio' ? 'on' : ''} onClick={() => setEntrega('envio')}>🚚 Envío a domicilio</button>
                </div>
              </div>

              {entrega === 'envio' && (
                <div>
                  <label className="sc-label">Dirección de envío</label>
                  <input className="sc-input" type="text" required value={direccion} onChange={e => setDireccion(e.target.value)} />
                </div>
              )}

              <button type="submit" className="sc-submit" disabled={enviando}>
                {enviando ? 'Procesando...' : `Confirmar pedido por $${total}`}
              </button>
            </form>
          </div>
        )}
      </div>

      {/* FOOTER */}
      <footer className="sc-footer">
        <div className="sc-footer-in">
          <p className="sc-footer-brand">Super<b>compras</b></p>
          <p>📍 Depósito: <b>Mitre 1044, Tres Lomas</b></p>
          <p>📞 Contacto / WhatsApp: <a href="https://wa.me/5492392000000" target="_blank" rel="noopener noreferrer">+54 9 2392 00-0000</a></p>
          <p>🔙 <a href="https://supercompra-bot.vercel.app">Volver al catálogo principal de Supercompra</a></p>
          <p style={{ fontSize: '0.8rem', opacity: 0.7, marginTop: '4px' }}>© 2026 Supercompra. Todos los derechos reservados.</p>
        </div>
      </footer>

      {/* BARRA FLOTANTE */}
      {total > 0 && (
        <div className="sc-bar">
          <div className="sc-bar-in">
            <div>
              <p className="sc-bar-lbl">Total a pagar</p>
              <p className="sc-bar-total">${total}</p>
            </div>
            <button onClick={() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' })}>
              Terminar compra
            </button>
          </div>
        </div>
      )}
    </main>
  );
}