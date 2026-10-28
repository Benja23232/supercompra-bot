'use client';

import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import Footer from '@/components/Footer';

/* ---------- Íconos Vectoriales (SVG) ---------- */
const MenuIcon = () => <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>;
const SearchIcon = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>;
const UserIcon = () => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>;
const CartIcon = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="21" r="1"></circle><circle cx="20" cy="21" r="1"></circle><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path></svg>;
const StoreIcon = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg>;
const BoxIcon = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="16.5" y1="9.4" x2="7.5" y2="4.21"></line><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg>;
const XIcon = () => <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>;
const ChevronDown = ({ open }: { open: boolean }) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.25s ease' }}>
    <polyline points="6 9 12 15 18 9"></polyline>
  </svg>
);

/* ---------- Asignador automático de Emojis por Rubro ---------- */
function obtenerEmojiRubro(nombre: string): string {
  const n = nombre.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  if (n.includes('gallet') || n.includes('snack') || n.includes('golosina') || n.includes('kiosco') || n.includes('dulce')) return '🍪';
  if (n.includes('almacen') || n.includes('conserva') || n.includes('comestible') || n.includes('despensa')) return '🥫';
  if (n.includes('lacteo') || n.includes('fresco') || n.includes('fiambre') || n.includes('queso')) return '🧀';
  if (n.includes('sin alcohol') || n.includes('infusion') || n.includes('gaseosa') || n.includes('jugo') || n.includes('agua')) return '🥤';
  if (n.includes('alcohol') || n.includes('bodega') || n.includes('vino') || n.includes('cerveza')) return '🍾';
  if (n.includes('bebida')) return '🥤';
  if (n.includes('limpieza') || n.includes('hogar') || n.includes('lavado')) return '🧹';
  if (n.includes('perfumer') || n.includes('cuidado') || n.includes('higiene') || n.includes('farmacia')) return '🧴';
  if (n.includes('mascota') || n.includes('perro') || n.includes('gato')) return '🐾';
  if (n.includes('congelado') || n.includes('helado') || n.includes('frio')) return '❄️';
  if (n.includes('panader') || n.includes('panific')) return '🥖';
  if (n.includes('carnic') || n.includes('carne') || n.includes('pollo')) return '🥩';
  if (n.includes('verdul') || n.includes('fruta') || n.includes('verdura')) return '🍎';
  if (n.includes('bazar') || n.includes('ferreter')) return '🛠️';
  return '📦';
}

export default function TiendaPrincipal() {
  const router = useRouter();
  const [productos, setProductos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Filtros
  const [busqueda, setBusqueda] = useState('');
  const [rubroActivo, setRubroActivo] = useState('Todos');
  const [categoriaActiva, setCategoriaActiva] = useState('Todas');

  // UI
  const [rubroExpandido, setRubroExpandido] = useState<string | null>(null);
  const [sidebarColapsado, setSidebarColapsado] = useState(false);
  const [sidebarMovilAbierto, setSidebarMovilAbierto] = useState(false);
  
  // MODAL: Producto seleccionado
  const [productoSeleccionado, setProductoSeleccionado] = useState<any>(null);

  // Carrito y Usuario
  const [carrito, setCarrito] = useState<any[]>([]);
  const [usuarioLocal, setUsuarioLocal] = useState<any>(null);

  useEffect(() => {
    const carritoGuardado = localStorage.getItem('supercompras_carrito');
    if (carritoGuardado) setCarrito(JSON.parse(carritoGuardado));

    const userGuardado = localStorage.getItem('supercompras_user');
    if (userGuardado) setUsuarioLocal(JSON.parse(userGuardado));
  }, []);

  useEffect(() => {
    localStorage.setItem('supercompras_carrito', JSON.stringify(carrito));
  }, [carrito]);

  useEffect(() => {
    async function fetchProductosCatalogo() {
      const { data, error } = await supabase
        .from('productos')
        .select('*')
        .eq('activo', true)
        .order('nombre', { ascending: true });
      if (error) console.error("Error al cargar el catálogo:", error);
      else if (data) setProductos(data);
      setLoading(false);
    }
    fetchProductosCatalogo();
  }, []);

  // Para evitar scroll cuando el modal está abierto
  useEffect(() => {
    if (productoSeleccionado) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => { document.body.style.overflow = 'unset'; }
  }, [productoSeleccionado]);

  const arbolRubros = useMemo(() => {
    const mapa: Record<string, Set<string>> = {};
    productos.forEach(p => {
      const rRaw = (p.rubro || '').trim();
      const r = !rRaw || rRaw.toLowerCase() === 'general' ? 'Otros' : rRaw;
      const c = (p.categoria || 'Varios').trim();
      if (!mapa[r]) mapa[r] = new Set();
      mapa[r].add(c);
    });

    const resultado: Record<string, string[]> = {};
    const clavesOrdenadas = Object.keys(mapa).sort((a, b) => {
      if (a === 'Otros') return 1;
      if (b === 'Otros') return -1;
      return a.localeCompare(b);
    });

    clavesOrdenadas.forEach(r => {
      resultado[r] = Array.from(mapa[r]).sort();
    });
    return resultado;
  }, [productos]);

  const listaRubros = ['Todos', ...Object.keys(arbolRubros)];

  const categoriasDisponibles = useMemo(() => {
    if (rubroActivo === 'Todos') {
      const todas = new Set<string>();
      Object.values(arbolRubros).forEach(cats => cats.forEach(c => todas.add(c)));
      return ['Todas', ...Array.from(todas).sort()];
    }
    return ['Todas', ...(arbolRubros[rubroActivo] || [])];
  }, [rubroActivo, arbolRubros]);

  const seleccionarRubro = (rubro: string, desdeSidebar = false) => {
    setRubroActivo(rubro);
    setCategoriaActiva('Todas');
    if (rubro === 'Todos') {
      setRubroExpandido(null);
      if (desdeSidebar) setSidebarMovilAbierto(false);
    } else {
      if (desdeSidebar && sidebarColapsado) setSidebarColapsado(false);
      setRubroExpandido(prev => (desdeSidebar && prev === rubro ? null : rubro));
    }
  };

  const seleccionarCategoria = (rubroPadre: string, categoria: string) => {
    if (rubroPadre !== 'Todos') setRubroActivo(rubroPadre);
    setCategoriaActiva(categoria);
    setSidebarMovilAbierto(false);
  };

  const manejarToggleSidebar = () => {
    if (typeof window !== 'undefined' && window.innerWidth <= 768) {
      setSidebarMovilAbierto(!sidebarMovilAbierto);
    } else {
      setSidebarColapsado(!sidebarColapsado);
    }
  };

  const productosFiltrados = productos.filter(p => {
    const rRaw = (p.rubro || '').trim();
    const r = !rRaw || rRaw.toLowerCase() === 'general' ? 'Otros' : rRaw;
    const c = (p.categoria || 'Varios').trim();
    const coincideRubro = rubroActivo === 'Todos' || r === rubroActivo;
    const coincideCategoria = categoriaActiva === 'Todas' || c === categoriaActiva;
    const coincideBusqueda = (p.nombre || '').toLowerCase().includes(busqueda.toLowerCase().trim());
    return coincideRubro && coincideCategoria && coincideBusqueda;
  });

  const agregarAlCarrito = (prod: any) => {
    const existente = carrito.find(item => item.id_producto === prod.id_producto);
    if (existente) {
      setCarrito(carrito.map(item =>
        item.id_producto === prod.id_producto ? { ...item, cantidad: item.cantidad + 1 } : item
      ));
    } else {
      setCarrito([...carrito, { ...prod, cantidad: 1 }]);
    }
  };

  const quitarDelCarrito = (id_producto: string) => {
    setCarrito(prev => prev.map(item => {
      if (item.id_producto === id_producto) return { ...item, cantidad: item.cantidad - 1 };
      return item;
    }).filter(item => item.cantidad > 0));
  };

  const totalCarrito = carrito.reduce((acc, item) => acc + (item.precio * item.cantidad), 0);

  const esSeccionAlcohol = 
    (rubroActivo.toLowerCase().includes('alcohol') && !rubroActivo.toLowerCase().includes('sin alcohol')) ||
    (categoriaActiva.toLowerCase().includes('alcohol') && !categoriaActiva.toLowerCase().includes('sin alcohol'));

  return (
    <div className="layout-app">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800;900&display=swap');

        :root {
          --verde-marca: #115B32; 
          --verde-hover: #0d4525;
          --verde-claro: #E8F5E9;
          --dorado: #C9922B;
          --dorado-claro: #FEF3C7;
          --fondo-app: #DCE3EA;
          --blanco: #FFFFFF;
          --texto-oscuro: #1E293B;
          --texto-gris: #64748B;
          --borde: #CBD5E1;
          
          --sidebar-width: 270px;
          --sidebar-collapsed: 78px;
          --nav-height: 76px;
        }

        * { margin: 0; padding: 0; box-sizing: border-box; font-family: 'Nunito', sans-serif; }
        .layout-app { background-color: var(--fondo-app); color: var(--texto-oscuro); display: flex; min-height: 100vh; overflow-x: hidden; }

        /* ... SIDEBAR ... */
        .sidebar { width: var(--sidebar-width); background-color: var(--blanco); border-right: 1px solid var(--borde); display: flex; flex-direction: column; position: fixed; top: 0; bottom: 0; left: 0; z-index: 1000; transition: width 0.3s cubic-bezier(0.25, 0.8, 0.25, 1), transform 0.3s ease; box-shadow: 4px 0 15px rgba(0,0,0,0.03); }
        .sidebar.collapsed { width: var(--sidebar-collapsed); }
        .logo-container { height: var(--nav-height); display: flex; align-items: center; padding: 0 16px; border-bottom: 1px solid var(--borde); gap: 12px; overflow: hidden; white-space: nowrap; flex-shrink: 0; }
        .logo-img { width: 44px; height: 44px; border-radius: 50%; border: 2px solid var(--verde-marca); object-fit: cover; flex-shrink: 0; }
        .logo-text { font-size: 1.45rem; font-weight: 900; color: var(--verde-marca); transition: opacity 0.2s; }
        .logo-text span { color: var(--dorado); }
        .sidebar.collapsed .logo-text { opacity: 0; pointer-events: none; }
        .sidebar-scroll { flex-grow: 1; overflow-y: auto; overflow-x: hidden; padding: 16px 10px; display: flex; flex-direction: column; gap: 6px; scrollbar-width: thin; }
        .sidebar-section-label { font-size: 0.75rem; font-weight: 900; text-transform: uppercase; letter-spacing: 0.08em; color: var(--texto-gris); padding: 12px 14px 4px; white-space: nowrap; }
        .sidebar.collapsed .sidebar-section-label { opacity: 0; height: 0; padding: 0; overflow: hidden; }
        .nav-item { display: flex; align-items: center; justify-content: space-between; padding: 11px 14px; color: var(--texto-oscuro); text-decoration: none; border-radius: 12px; font-weight: 700; font-size: 0.94rem; transition: all 0.2s; cursor: pointer; border: none; background: transparent; width: 100%; text-align: left; white-space: nowrap; }
        .nav-item-left { display: flex; align-items: center; gap: 12px; overflow: hidden; }
        .nav-item-icon { min-width: 24px; display: flex; align-items: center; justify-content: center; color: var(--verde-marca); font-size: 1.15rem; }
        .nav-text { overflow: hidden; text-overflow: ellipsis; }
        .nav-item:hover { background-color: var(--verde-claro); color: var(--verde-marca); }
        .nav-item.active { background-color: var(--verde-marca); color: var(--blanco); box-shadow: 0 4px 12px rgba(17, 91, 50, 0.25); }
        .nav-item.active .nav-item-icon { color: var(--blanco); }
        .sidebar.collapsed .nav-text, .sidebar.collapsed .nav-chevron { opacity: 0; display: none; }
        .sidebar.collapsed .nav-item { justify-content: center; padding: 12px 0; }
        .sub-cat-list { display: flex; flex-direction: column; gap: 4px; padding: 6px 0 8px 32px; border-left: 2px solid var(--verde-claro); margin-left: 24px; margin-top: 2px; }
        .sidebar.collapsed .sub-cat-list { display: none; }
        .sub-cat-btn { background: none; border: none; text-align: left; padding: 8px 12px; border-radius: 8px; font-size: 0.88rem; font-weight: 700; color: var(--texto-gris); cursor: pointer; transition: all 0.15s; }
        .sub-cat-btn:hover { color: var(--verde-marca); background-color: #F1F5F9; }
        .sub-cat-btn.active { color: var(--dorado); background-color: var(--dorado-claro); font-weight: 800; }
        .sidebar-footer { padding: 12px 10px; border-top: 1px solid var(--borde); }
        .mobile-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.6); z-index: 990; display: none; opacity: 0; transition: opacity 0.3s; }
        .mobile-overlay.active { display: block; opacity: 1; }

        /* ... MAIN WRAPPER ... */
        .main-wrapper { flex-grow: 1; margin-left: var(--sidebar-width); display: flex; flex-direction: column; width: calc(100% - var(--sidebar-width)); min-height: 100vh; transition: margin-left 0.3s cubic-bezier(0.25, 0.8, 0.25, 1), width 0.3s ease; }
        .main-wrapper.expanded { margin-left: var(--sidebar-collapsed); width: calc(100% - var(--sidebar-collapsed)); }
        .top-nav { height: var(--nav-height); background-color: var(--verde-marca); display: flex; align-items: center; justify-content: space-between; padding: 0 28px; position: sticky; top: 0; z-index: 900; box-shadow: 0 4px 18px rgba(0,0,0,0.12); }
        .nav-left { display: flex; align-items: center; gap: 18px; flex: 1; }
        .toggle-btn { background: rgba(255,255,255,0.12); border: none; color: var(--blanco); cursor: pointer; display: flex; align-items: center; justify-content: center; width: 42px; height: 42px; border-radius: 10px; transition: background 0.2s; }
        .toggle-btn:hover { background: rgba(255,255,255,0.22); }
        .search-bar { display: flex; align-items: center; background-color: var(--blanco); border-radius: 16px; padding: 10px 18px; width: 100%; max-width: 480px; border: 2px solid transparent; transition: all 0.3s; box-shadow: 0 4px 12px rgba(0,0,0,0.1); }
        .search-bar:focus-within { border-color: var(--dorado); }
        .search-bar input { border: none; background: transparent; outline: none; width: 100%; padding-left: 12px; font-size: 0.98rem; color: var(--texto-oscuro); font-weight: 600; }
        .nav-right { display: flex; align-items: center; gap: 14px; }
        .user-btn { width: 42px; height: 42px; border-radius: 50%; background-color: rgba(255,255,255,0.15); color: var(--blanco); display: flex; align-items: center; justify-content: center; cursor: pointer; border: none; transition: background 0.2s; }
        .user-btn:hover { background-color: rgba(255,255,255,0.25); }
        .cart-btn { background-color: var(--dorado); color: var(--blanco); border: none; padding: 10px 22px; border-radius: 12px; font-weight: 800; font-size: 1rem; cursor: pointer; display: flex; align-items: center; gap: 10px; box-shadow: 0 4px 15px rgba(201, 146, 43, 0.4); transition: transform 0.2s; }
        .cart-btn:hover { transform: translateY(-2px); background-color: #B07D1E; }

        /* ... CONTENIDO Y PRODUCTOS ... */
        .content-area { padding: 24px 28px; max-width: 1400px; margin: 0 auto; width: 100%; flex-grow: 1; }
        
        .rubros-header-bar { margin-bottom: 18px; }
        .rubros-slider { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
        
        .rubro-pill { background-color: var(--blanco); border: 1.5px solid var(--borde); padding: 8px 16px; border-radius: 999px; font-weight: 800; font-size: 0.88rem; color: var(--texto-oscuro); cursor: pointer; white-space: nowrap; transition: all 0.2s ease; box-shadow: 0 2px 6px rgba(0,0,0,0.04); display: inline-flex; align-items: center; gap: 7px; flex-shrink: 0; }
        
        .rubro-pill:hover { border-color: var(--verde-marca); color: var(--verde-marca); transform: translateY(-1px); background-color: #F8FAFC; }
        .rubro-pill.active { background-color: var(--verde-marca); border-color: var(--verde-marca); color: var(--blanco); box-shadow: 0 4px 12px rgba(17, 91, 50, 0.25); }
        .rubro-pill-emoji { font-size: 1.05rem; line-height: 1; }
        
        .results-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 22px; flex-wrap: wrap; gap: 14px; background: var(--blanco); padding: 14px 20px; border-radius: 16px; box-shadow: 0 4px 14px rgba(0,0,0,0.04); }
        .results-title-group { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
        .section-title { font-size: 1.35rem; font-weight: 900; color: var(--texto-oscuro); letter-spacing: -0.4px; margin: 0; }
        .section-title span { color: var(--dorado); }
        .results-count { font-size: 0.82rem; font-weight: 800; color: var(--verde-marca); background: var(--verde-claro); padding: 4px 12px; border-radius: 20px; }
        .select-cat-box { display: flex; align-items: center; gap: 10px; }
        .select-cat-box label { font-size: 0.88rem; font-weight: 800; color: var(--texto-gris); white-space: nowrap; }
        .cat-select { appearance: none; -webkit-appearance: none; background-color: #F8FAFC; border: 1.5px solid var(--borde); border-radius: 10px; padding: 8px 36px 8px 14px; font-size: 0.9rem; font-weight: 800; color: var(--texto-oscuro); cursor: pointer; outline: none; transition: all 0.2s; min-width: 200px; background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%23115B32' stroke-width='3' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E"); background-repeat: no-repeat; background-position: right 12px center; }
        .cat-select:hover { border-color: var(--verde-marca); background-color: var(--blanco); }
        .cat-select:focus { border-color: var(--dorado); box-shadow: 0 0 0 3px rgba(201, 146, 43, 0.2); background-color: var(--blanco); }
        
        .products-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(225px, 1fr)); gap: 20px; }
        .product-card { background-color: var(--blanco); border-radius: 20px; overflow: hidden; border: 1px solid rgba(255,255,255,0.6); transition: transform 0.25s ease, box-shadow 0.25s ease; display: flex; flex-direction: column; box-shadow: 0 10px 24px -4px rgba(15, 23, 42, 0.08), 0 4px 10px -2px rgba(15, 23, 42, 0.04); }
        .product-card:hover { transform: translateY(-6px); box-shadow: 0 20px 32px -6px rgba(15, 23, 42, 0.14), 0 8px 16px -4px rgba(15, 23, 42, 0.06); }
        .product-img-box { position: relative; width: 100%; height: 190px; background-color: #FFFFFF; border-bottom: 1px solid #F1F5F9; display: flex; align-items: center; justify-content: center; padding: 16px; cursor: pointer; transition: background 0.2s; }
        .product-img-box:hover { background-color: #F8FAFC; }
        .product-img { width: 100%; height: 100%; object-fit: contain; }
        .product-badge-cat { position: absolute; top: 10px; right: 10px; background: rgba(241, 245, 249, 0.9); color: var(--texto-gris); font-size: 0.72rem; font-weight: 800; padding: 4px 10px; border-radius: 20px; text-align: center; }
        .product-info { padding: 18px; display: flex; flex-direction: column; flex-grow: 1; justify-content: space-between; gap: 14px; }
        .product-title { font-size: 1.02rem; font-weight: 800; color: var(--texto-oscuro); margin: 0; line-height: 1.3; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; cursor: pointer; }
        .product-title:hover { color: var(--verde-marca); }
        .product-price { font-size: 1.5rem; font-weight: 900; color: var(--verde-marca); margin-top: 6px; }
        
        .add-btn { background-color: var(--verde-claro); color: var(--verde-marca); border: none; padding: 12px; border-radius: 12px; font-weight: 800; font-size: 0.95rem; cursor: pointer; transition: all 0.2s; width: 100%; }
        .add-btn:hover { background-color: var(--verde-marca); color: var(--blanco); }
        .btn-agotado { background-color: #F1F5F9; color: #94A3B8; border: none; padding: 12px; border-radius: 12px; font-weight: 800; font-size: 0.95rem; width: 100%; cursor: not-allowed; }
        
        .step-controls { display: flex; align-items: center; justify-content: space-between; background-color: var(--verde-claro); border-radius: 12px; padding: 4px; width: 100%; }
        .step-controls button { width: 38px; height: 38px; border: none; border-radius: 9px; background-color: var(--blanco); color: var(--verde-marca); font-size: 1.25rem; font-weight: 900; cursor: pointer; box-shadow: 0 2px 5px rgba(0,0,0,0.06); transition: all 0.2s; }
        .step-controls button:hover { background-color: var(--verde-marca); color: var(--blanco); }
        .step-controls span { font-weight: 900; font-size: 1.1rem; color: var(--verde-marca); min-width: 36px; text-align: center; }

        /* ... MODAL DETALLE DE PRODUCTO ... */
        .modal-overlay { position: fixed; inset: 0; background: rgba(15, 23, 42, 0.75); z-index: 2000; display: flex; align-items: center; justify-content: center; padding: 20px; backdrop-filter: blur(4px); opacity: 0; animation: fadeIn 0.2s forwards; }
        .modal-box { background: var(--blanco); border-radius: 24px; width: 100%; max-width: 850px; max-height: 90vh; display: flex; flex-direction: column; overflow: hidden; position: relative; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25); transform: scale(0.95) translateY(15px); animation: modalIn 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards; }
        @keyframes fadeIn { to { opacity: 1; } }
        @keyframes modalIn { to { transform: scale(1) translateY(0); } }
        .modal-close { position: absolute; top: 16px; right: 16px; background: rgba(255,255,255,0.9); backdrop-filter: blur(4px); border: none; width: 44px; height: 44px; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: var(--texto-oscuro); cursor: pointer; transition: all 0.2s; z-index: 10; box-shadow: 0 4px 10px rgba(0,0,0,0.1); }
        .modal-close:hover { background: #F1F5F9; color: var(--verde-marca); transform: scale(1.05); }
        .modal-body { display: grid; grid-template-columns: 1fr 1fr; overflow-y: auto; }
        .modal-img-container { background: #F8FAFC; padding: 40px; display: flex; align-items: center; justify-content: center; border-right: 1px solid #F1F5F9; }
        .modal-img-container img { width: 100%; height: auto; max-height: 400px; object-fit: contain; }
        .modal-info { padding: 40px; display: flex; flex-direction: column; }
        .modal-cat { color: #64748B; font-weight: 800; font-size: 0.85rem; margin-bottom: 12px; text-transform: uppercase; letter-spacing: 0.05em; background: #F1F5F9; display: inline-block; padding: 6px 12px; border-radius: 8px; align-self: flex-start; }
        .modal-title { font-size: 1.8rem; font-weight: 900; color: #1E293B; margin: 0 0 8px; line-height: 1.2; }
        .modal-price { font-size: 2.4rem; font-weight: 900; color: var(--verde-marca); margin-bottom: 24px; }
        .modal-desc { color: #475569; font-size: 1.05rem; line-height: 1.6; margin-bottom: 32px; flex-grow: 1; }
        .modal-actions { margin-top: auto; border-top: 1px solid #F1F5F9; padding-top: 24px; }

        /* ... OTROS ... */
        .banner-bebidas { background: linear-gradient(135deg, #111827 0%, #000000 100%); border-radius: 20px; padding: 32px 20px; text-align: center; margin-bottom: 28px; box-shadow: 0 15px 30px rgba(0,0,0,0.2); }
        .banner-bebidas h3 { color: var(--dorado); font-size: 1.7rem; margin: 0 0 8px 0; font-weight: 900; }
        .banner-bebidas p { color: #E2E8F0; margin: 0 auto 20px auto; font-size: 1rem; line-height: 1.5; max-width: 580px; }
        .btn-whatsapp-banner { display: inline-flex; align-items: center; gap: 10px; background: #25D366; color: #fff; padding: 14px 28px; border-radius: 12px; font-weight: 800; text-decoration: none; font-size: 1.05rem; box-shadow: 0 8px 20px rgba(37, 211, 102, 0.3); }
        .search-mobile { display: none; align-items: center; background-color: var(--blanco); border-radius: 14px; padding: 12px 16px; width: 100%; margin-bottom: 18px; box-shadow: 0 4px 12px rgba(0,0,0,0.05); }
        .search-mobile input { border: none; outline: none; width: 100%; padding-left: 10px; font-size: 0.95rem; color: var(--texto-oscuro); font-weight: 600; }

        /* ================= RESPONSIVE (LA MAGIA PARA CELULARES) ================= */
        @media (max-width: 1024px) {
          .content-area { padding: 20px; }
          .products-grid { gap: 16px; }
        }

        @media (max-width: 768px) {
          .sidebar { transform: translateX(-100%); width: 280px !important; }
          .sidebar.mobile-open { transform: translateX(0); }
          .main-wrapper, .main-wrapper.expanded { margin-left: 0 !important; width: 100% !important; }
          
          .top-nav { padding: 0 16px; }
          .search-bar { display: none; }
          .search-mobile { display: flex; margin-bottom: 12px; }
          
          .content-area { padding: 16px 12px; }
          
          /* --- ACÁ ESTÁ EL CAMBIO PARA QUE LOS RUBROS BAJEN DE LÍNEA --- */
          .rubros-header-bar { 
            margin-bottom: 16px; 
          }
          
          .rubros-slider { 
            display: flex;
            flex-wrap: wrap; /* Esto obliga a que si no entran, bajen de renglón */
            gap: 8px;
          }
          
          .rubro-pill { 
            padding: 6px 14px; 
            font-size: 0.85rem; 
          }
          
          .rubro-pill-emoji {
            font-size: 0.95rem;
          }
          /* ------------------------------------------------------------- */
          
          .results-header { flex-direction: column; align-items: flex-start; padding: 16px; gap: 16px; }
          .results-title-group { width: 100%; flex-direction: column; align-items: flex-start; gap: 8px; }
          .section-title { font-size: 1.25rem; line-height: 1.3; }
          .results-count { align-self: flex-start; }
          
          .select-cat-box { width: 100%; flex-direction: column; align-items: stretch; gap: 8px; }
          .select-cat-box label { font-size: 0.9rem; margin-left: 4px; }
          .cat-select { width: 100%; padding: 12px 36px 12px 14px; font-size: 1rem; border-radius: 12px; }
          
          .products-grid { grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 12px; }
          .product-img-box { height: 130px; padding: 8px; }
          .product-info { padding: 10px; gap: 8px; }
          .product-title { font-size: 0.9rem; line-height: 1.25; }
          .product-price { font-size: 1.25rem; margin-top: 4px; }
          .product-badge-cat { font-size: 0.65rem; padding: 4px 8px; top: 6px; right: 6px; max-width: 85%; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
          
          .add-btn { padding: 10px; font-size: 0.85rem; }
          .step-controls button { width: 32px; height: 32px; font-size: 1.1rem; border-radius: 6px; }
          .step-controls span { font-size: 1rem; min-width: 24px; }
          
          .modal-box { max-height: 90vh; max-width: 92%; margin: 10px; border-radius: 20px; }
          .modal-body { grid-template-columns: 1fr; }
          .modal-img-container { padding: 20px; border-right: none; border-bottom: 1px solid #F1F5F9; }
          .modal-img-container img { max-height: 180px; }
          .modal-info { padding: 20px; }
          .modal-title { font-size: 1.3rem; margin-bottom: 4px; }
          .modal-price { font-size: 1.8rem; margin-bottom: 12px; }
          .modal-desc { font-size: 0.95rem; margin-bottom: 20px; }
          .modal-close { top: 12px; right: 12px; width: 36px; height: 36px; }
          
          .banner-bebidas { padding: 24px 16px; }
          .banner-bebidas h3 { font-size: 1.2rem; }
          .btn-whatsapp-banner { font-size: 0.95rem; padding: 12px 20px; width: 100%; justify-content: center; }
        }
      `}</style>

      {/* OVERLAY PARA CELULAR (SIDEBAR) */}
      <div className={`mobile-overlay ${sidebarMovilAbierto ? 'active' : ''}`} onClick={() => setSidebarMovilAbierto(false)} />

      {/* MODAL DE PRODUCTO */}
      {productoSeleccionado && (
        <div className="modal-overlay" onClick={() => setProductoSeleccionado(null)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setProductoSeleccionado(null)}><XIcon /></button>
            <div className="modal-body">
              <div className="modal-img-container">
                <img 
                  src={productoSeleccionado.image_url || '/placeholder-producto.jpg'} 
                  alt={productoSeleccionado.nombre} 
                  onError={(e) => { e.currentTarget.src = 'https://via.placeholder.com/500x500?text=Sin+Imagen' }}
                />
              </div>
              <div className="modal-info">
                <span className="modal-cat">
                  {productoSeleccionado.rubro || 'General'} › {productoSeleccionado.categoria || 'Varios'}
                </span>
                <h2 className="modal-title">{productoSeleccionado.nombre}</h2>
                <div className="modal-price">${productoSeleccionado.precio}</div>
                
                {productoSeleccionado.descripcion ? (
                  <p className="modal-desc">{productoSeleccionado.descripcion}</p>
                ) : (
                  <p className="modal-desc">Este producto no cuenta con descripción adicional. Calidad garantizada por Supercompras.</p>
                )}

                <div className="modal-actions">
                  {(() => {
                    const cantEnCarrito = carrito.find(item => item.id_producto === productoSeleccionado.id_producto)?.cantidad || 0;
                    const sinStock = productoSeleccionado.stock_fisico <= 0;

                    if (sinStock) {
                      return <button disabled className="btn-agotado">Agotado</button>;
                    }
                    if (cantEnCarrito > 0) {
                      return (
                        <div className="step-controls" style={{ height: '52px' }}>
                          <button onClick={() => quitarDelCarrito(productoSeleccionado.id_producto)} style={{ width: '52px', height: '44px' }}>−</button>
                          <span style={{ fontSize: '1.3rem' }}>{cantEnCarrito} en carrito</span>
                          <button onClick={() => agregarAlCarrito(productoSeleccionado)} style={{ width: '52px', height: '44px' }}>+</button>
                        </div>
                      );
                    }
                    return (
                      <button onClick={() => agregarAlCarrito(productoSeleccionado)} className="add-btn" style={{ padding: '16px', fontSize: '1.1rem' }}>
                        Agregar al Carrito
                      </button>
                    );
                  })()}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SIDEBAR LATERAL CON EMOJIS POR RUBRO */}
      <aside className={`sidebar ${sidebarColapsado ? 'collapsed' : ''} ${sidebarMovilAbierto ? 'mobile-open' : ''}`}>
        <div className="logo-container">
          <img src="/supercompras_2.jpeg" alt="Logo" className="logo-img" onError={(e) => e.currentTarget.src = 'https://via.placeholder.com/45'} />
          <div className="logo-text">Super<span>compras</span></div>
        </div>

        <div className="sidebar-scroll">
          {/* Accesos Principales */}
          <button className={`nav-item ${rubroActivo === 'Todos' ? 'active' : ''}`} onClick={() => seleccionarRubro('Todos', true)} title="Todo el Súper">
            <div className="nav-item-left"><span className="nav-item-icon"><StoreIcon /></span><span className="nav-text">Todo el Súper</span></div>
          </button>

          <button className="nav-item" onClick={() => router.push('/mis-compras')} title="Mis Compras">
            <div className="nav-item-left"><span className="nav-item-icon"><BoxIcon /></span><span className="nav-text">Mis Compras</span></div>
          </button>

          {/* Listado de Rubros con Emojis y Categorías Desplegables */}
          <div className="sidebar-section-label">Rubros</div>
          {Object.entries(arbolRubros).map(([rubro, categorias]) => {
            const estaActivo = rubroActivo === rubro;
            const estaExpandido = rubroExpandido === rubro;
            const emoji = obtenerEmojiRubro(rubro);
            return (
              <div key={rubro}>
                <button className={`nav-item ${estaActivo ? 'active' : ''}`} onClick={() => seleccionarRubro(rubro, true)} title={rubro}>
                  <div className="nav-item-left"><span className="nav-item-icon">{emoji}</span><span className="nav-text">{rubro}</span></div>
                  <span className="nav-chevron"><ChevronDown open={estaExpandido} /></span>
                </button>
                {estaExpandido && categorias.length > 0 && (
                  <div className="sub-cat-list">
                    <button className={`sub-cat-btn ${estaActivo && categoriaActiva === 'Todas' ? 'active' : ''}`} onClick={() => seleccionarCategoria(rubro, 'Todas')}>
                      Ver todo en {rubro}
                    </button>
                    {categorias.map(cat => (
                      <button key={cat} className={`sub-cat-btn ${estaActivo && categoriaActiva === cat ? 'active' : ''}`} onClick={() => seleccionarCategoria(rubro, cat)}>
                        • {cat}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="sidebar-footer">
          <button className="nav-item" onClick={() => router.push(usuarioLocal ? '/perfil' : '/login')} title="Ingresar / Perfil">
            <div className="nav-item-left">
              <span className="nav-item-icon"><UserIcon /></span>
              <span className="nav-text">{usuarioLocal ? 'Mi Perfil' : 'Ingresar / Perfil'}</span>
            </div>
          </button>
        </div>
      </aside>

      {/* CONTENEDOR PRINCIPAL */}
      <div className={`main-wrapper ${sidebarColapsado ? 'expanded' : ''}`}>
        
        {/* NAVEGACIÓN SUPERIOR VERDE */}
        <nav className="top-nav">
          <div className="nav-left">
            <button className="toggle-btn" onClick={manejarToggleSidebar} title="Alternar menú"><MenuIcon /></button>
            <div className="search-bar">
              <span style={{ color: '#94A3B8', display: 'flex' }}><SearchIcon /></span>
              <input type="text" placeholder="Buscar fideos, galletitas, limpieza..." value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
            </div>
          </div>

          <div className="nav-right">
            <button className="user-btn" onClick={() => router.push(usuarioLocal ? '/perfil' : '/login')}><UserIcon /></button>
            <button className="cart-btn" onClick={() => router.push('/checkout')}>
              <CartIcon /><span>${totalCarrito}</span>
            </button>
          </div>
        </nav>

        {/* ÁREA DE CONTENIDO */}
        <main className="content-area">
          <div className="search-mobile">
            <span style={{ color: '#94A3B8', display: 'flex' }}><SearchIcon /></span>
            <input type="text" placeholder="Buscar productos..." value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
          </div>

          {!loading && listaRubros.length > 1 && (
            <div className="rubros-header-bar">
              <div className="rubros-slider">
                {listaRubros.map(rubro => (
                  <button key={rubro} className={`rubro-pill ${rubroActivo === rubro ? 'active' : ''}`} onClick={() => seleccionarRubro(rubro, false)}>
                    <span className="rubro-pill-emoji">{rubro === 'Todos' ? '⭐' : obtenerEmojiRubro(rubro)}</span>
                    <span>{rubro === 'Todos' ? 'Todos los Rubros' : rubro}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="results-header">
            <div className="results-title-group">
              <h2 className="section-title">
                {rubroActivo === 'Todos' ? 'Catálogo General' : rubroActivo}
                {categoriaActiva !== 'Todas' && <span> › {categoriaActiva}</span>}
              </h2>
              {!loading && <span className="results-count">{productosFiltrados.length} {productosFiltrados.length === 1 ? 'producto' : 'productos'}</span>}
            </div>

            {!loading && categoriasDisponibles.length > 1 && (
              <div className="select-cat-box">
                <label htmlFor="cat-select">Categoría:</label>
                <select id="cat-select" className="cat-select" value={categoriaActiva} onChange={(e) => setCategoriaActiva(e.target.value)}>
                  {categoriasDisponibles.map(cat => (
                    <option key={cat} value={cat}>{cat === 'Todas' ? 'Todas las categorías' : cat}</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {loading ? (
            <div style={{ textAlign: 'center', padding: '60px 0', color: '#64748B' }}>
              <h2>Cargando góndolas... 🛒</h2>
            </div>
          ) : (
            <>
              {esSeccionAlcohol && (
                <div className="banner-bebidas">
                  <h3>🍾 Catálogo Exclusivo de Bebidas</h3>
                  <p>Mirá todas nuestras promos en vinos, cervezas, aperitivos y destilados en nuestro anexo exclusivo.</p>
                  <a href="https://supercompra-bot.vercel.app/bebidas" target="_blank" rel="noopener noreferrer" className="btn-whatsapp-banner">Ir al Catálogo de Bebidas 🥂</a>
                </div>
              )}

              {productosFiltrados.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '50px 20px', background: '#fff', borderRadius: '20px', color: '#64748B' }}>
                  <span style={{ fontSize: '3rem', display: 'block', marginBottom: '10px' }}>🤷‍♂️</span>
                  <p style={{ fontSize: '1.15rem', fontWeight: 800 }}>No encontramos productos en esta selección.</p>
                  <button onClick={() => { setRubroActivo('Todos'); setCategoriaActiva('Todas'); setBusqueda(''); }} style={{ marginTop: '14px', padding: '10px 20px', background: '#115B32', color: '#fff', border: 'none', borderRadius: '10px', fontWeight: 800, cursor: 'pointer' }}>Limpiar filtros</button>
                </div>
              ) : (
                <div className="products-grid">
                  {productosFiltrados.map((prod) => {
                    const cantEnCarrito = carrito.find(item => item.id_producto === prod.id_producto)?.cantidad || 0;
                    const sinStock = prod.stock_fisico <= 0;

                    return (
                      <div key={prod.id_producto} className="product-card">
                        <div className="product-img-box" onClick={() => setProductoSeleccionado(prod)}>
                          {prod.categoria && <span className="product-badge-cat">{prod.categoria}</span>}
                          <img src={prod.image_url || '/placeholder-producto.jpg'} alt={prod.nombre} className="product-img" onError={(e) => { e.currentTarget.src = 'https://via.placeholder.com/300x300?text=Sin+Imagen' }} />
                        </div>
                        <div className="product-info">
                          <div>
                            <h3 className="product-title" onClick={() => setProductoSeleccionado(prod)}>{prod.nombre}</h3>
                            <p className="product-price">${prod.precio}</p>
                          </div>
                          
                          {sinStock ? (
                            <button disabled className="btn-agotado">Agotado</button>
                          ) : cantEnCarrito > 0 ? (
                            <div className="step-controls">
                              <button onClick={() => quitarDelCarrito(prod.id_producto)}>−</button>
                              <span>{cantEnCarrito}</span>
                              <button onClick={() => agregarAlCarrito(prod)}>+</button>
                            </div>
                          ) : (
                            <button onClick={() => agregarAlCarrito(prod)} className="add-btn">Agregar al Carrito</button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </main>
        
        <Footer />
      </div>
    </div>
  );
}