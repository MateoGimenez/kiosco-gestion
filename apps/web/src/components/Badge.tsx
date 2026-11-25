import type { ReactNode } from 'react';

interface BadgeProps {
  tone: 'ok' | 'off' | 'warn' | 'bad';
  children: ReactNode;
}

/** Insignia de estado: siempre con texto, el color solo acompaña. */
export function Badge({ tone, children }: BadgeProps) {
  return <span className={`status status--${tone}`}>{children}</span>;
}
