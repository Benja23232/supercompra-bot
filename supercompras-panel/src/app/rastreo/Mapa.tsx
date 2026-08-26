'use client';

import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

// Arreglo obligatorio para los íconos de Leaflet en Next.js
const iconBase = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images';
const DefaultIcon = L.icon({
  iconUrl: `${iconBase}/marker-icon.png`,
  iconRetinaUrl: `${iconBase}/marker-icon-2x.png`,
  shadowUrl: `${iconBase}/marker-shadow.png`,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});
L.Marker.prototype.options.icon = DefaultIcon;

// Ícono personalizado de moto (podés cambiar la URL por el PNG que más te guste)
const MotoIcon = L.icon({
  iconUrl: 'https://cdn-icons-png.flaticon.com/512/751/751145.png',
  iconSize: [45, 45],
  iconAnchor: [22, 22],
  popupAnchor: [0, -22]
});

export default function Mapa({ repartidores }: { repartidores: any[] }) {
  // Coordenadas aproximadas del centro de Tres Lomas
  const centroPorDefecto: [number, number] = [-36.4604, -62.8643];

  return (
    <MapContainer center={centroPorDefecto} zoom={15} style={{ height: '100%', width: '100%', zIndex: 1 }}>
      <TileLayer
        attribution='&copy; OpenStreetMap'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      
      {repartidores.map((rep) => (
        <Marker key={rep.email} position={[rep.latitud, rep.longitud]} icon={MotoIcon}>
          <Popup>
            <div style={{ textAlign: 'center' }}>
              <strong>🛵 Repartidor</strong> <br />
              <span style={{ color: '#2563eb' }}>{rep.email}</span> <br />
              <span style={{ fontSize: '0.8rem', color: '#64748b' }}>
                Actualizado: {new Date(rep.actualizado_en).toLocaleTimeString()}
              </span>
            </div>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}