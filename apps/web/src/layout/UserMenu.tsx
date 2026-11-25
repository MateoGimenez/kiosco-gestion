import { useEffect, useId, useRef, useState } from 'react';
import { Link } from 'react-router';

interface UserMenuProps {
  fullName: string;
  roleLabel: string;
  /** Ruta a la que se vuelve después de cambiar la contraseña. */
  from: string;
  passwordRoute: string;
}

/**
 * Menú de la cuenta: el nombre de quien está usando el sistema y, adentro, "Cambiar mi contraseña".
 * Es un menú simple de un botón y una lista de enlaces: se cierra con Escape, con un clic afuera
 * o al elegir una opción. "Cambiar usuario" queda siempre a la vista porque se usa varias veces por turno.
 */
export function UserMenu({ fullName, roleLabel, from, passwordRoute }: UserMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false);
        buttonRef.current?.focus();
      }
    }
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div className="usermenu" ref={rootRef}>
      <button
        ref={buttonRef}
        type="button"
        className="usermenu__button"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={`Mi cuenta: ${fullName}, ${roleLabel}`}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="usermenu__text">
          <span className="usermenu__name">{fullName}</span>
          <span className="usermenu__role">{roleLabel}</span>
        </span>
        <span className="usermenu__chevron" aria-hidden="true" />
      </button>
      {open && (
        <div className="usermenu__panel" id={menuId}>
          <Link
            to={passwordRoute}
            state={{ from }}
            className="usermenu__item"
            onClick={() => setOpen(false)}
          >
            Cambiar mi contraseña
          </Link>
        </div>
      )}
    </div>
  );
}
