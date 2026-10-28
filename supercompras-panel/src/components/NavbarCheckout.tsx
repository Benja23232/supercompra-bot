'use client';

import { useRouter } from 'next/navigation';

export default function NavbarCheckout() {
  const router = useRouter();

  return (
    <>
      <style>{`
        .ck-nav-global { 
          height: 76px; 
          background: #FFFFFF; 
          display: flex; 
          align-items: center; 
          justify-content: space-between; 
          padding: 0 28px; 
          border-bottom: 1px solid #E2E8F0; 
          position: sticky; 
          top: 0; 
          z-index: 100; 
          box-shadow: 0 4px 15px rgba(0,0,0,0.02); 
          font-family: 'Nunito', sans-serif; 
        }
        .ck-nav-left, .ck-nav-right { 
          flex: 1; 
          display: flex; 
          align-items: center; 
        }
        .ck-nav-right { 
          justify-content: flex-end; 
          color: #115B32; 
          font-weight: 800; 
          font-size: 0.9rem; 
          gap: 6px; 
        }
        .ck-nav-center { 
          flex: 1; 
          text-align: center; 
          display: flex; 
          justify-content: center; 
        }
        .ck-brand { 
          font-size: 1.6rem; 
          font-weight: 900; 
          color: #115B32; 
          margin: 0; 
          letter-spacing: -0.02em;
        }
        .ck-brand span { 
          color: #C9922B; 
        }
        .ck-back-btn { 
          display: flex; 
          align-items: center; 
          gap: 8px; 
          background: none; 
          border: none; 
          font-size: 1rem; 
          font-weight: 800; 
          color: #64748B; 
          cursor: pointer; 
          transition: color 0.2s; 
          padding: 0; 
        }
        .ck-back-btn:hover { 
          color: #115B32; 
        }
        @media (max-width: 600px) {
          .ck-nav-global { padding: 0 16px; }
          .hide-mobile { display: none; }
          .ck-brand { font-size: 1.3rem; }
        }
      `}</style>

      <nav className="ck-nav-global">
        <div className="ck-nav-left">
          <button onClick={() => router.push('/tienda')} className="ck-back-btn" aria-label="Volver">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="19" y1="12" x2="5" y2="12"></line>
              <polyline points="12 19 5 12 12 5"></polyline>
            </svg>
            <span className="hide-mobile">Volver al Súper</span>
          </button>
        </div>
        
        <div className="ck-nav-center">
          <h1 className="ck-brand">Super<span>compras</span></h1>
        </div>
        
        <div className="ck-nav-right">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
            <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
          </svg>
          <span className="hide-mobile">Checkout</span>
        </div>
      </nav>
    </>
  );
}