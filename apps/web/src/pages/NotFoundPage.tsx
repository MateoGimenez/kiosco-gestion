import { Link } from 'react-router';

export function NotFoundPage() {
  return (
    <div className="page">
      <h1>No encontramos esa pantalla</h1>
      <p>
        La dirección no existe o ya no está disponible. <Link to="/">Volver al inicio</Link>
      </p>
    </div>
  );
}
