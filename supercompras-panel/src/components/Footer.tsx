// components/Footer.tsx
export default function Footer() {
  return (
    <>
      <style>{`
        .sc-footer-global { 
          background-color: #FFFFFF; 
          padding: 35px 25px; 
          text-align: center; 
          margin-top: auto; 
          border-top: 1px solid #CBD5E1; 
          font-family: 'Nunito', sans-serif;
        }
        .sc-footer-global-logo { 
          font-size: 1.45rem; 
          font-weight: 900; 
          color: #115B32; 
          margin-bottom: 6px; 
        }
        .sc-footer-global-logo span { 
          color: #C9922B; 
        }
        .sc-footer-global p { 
          color: #64748B; 
          font-size: 0.9rem; 
          font-weight: 600; 
          margin: 0;
        }
      `}</style>
      
      <footer className="sc-footer-global">
        <div className="sc-footer-global-logo">Super<span>compras</span></div>
        <p>Tu supermercado online en Tres Lomas</p>
        <p style={{ fontSize: '0.82rem', marginTop: '6px' }}>© {new Date().getFullYear()} Todos los derechos reservados.</p>
      </footer>
    </>
  );
}