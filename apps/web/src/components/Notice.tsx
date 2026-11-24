import type { ReactNode } from 'react';

interface NoticeProps {
  variant?: 'info' | 'success' | 'warning';
  children: ReactNode;
}

/** Aviso que un lector de pantalla anuncia solo (aria-live). Siempre lleva texto, no solo color. */
export function Notice({ variant = 'info', children }: NoticeProps) {
  return (
    <div className={`notice notice--${variant}`} role="status">
      {children}
    </div>
  );
}
