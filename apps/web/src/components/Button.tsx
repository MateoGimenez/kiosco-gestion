import type { ButtonHTMLAttributes } from 'react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger';
  /** Botón grande (56px) para las acciones principales del mostrador. */
  large?: boolean;
  /** Mientras es true, el botón queda inactivo y avisa que está trabajando. */
  loading?: boolean;
}

export function Button({
  variant = 'primary',
  large = false,
  loading = false,
  disabled,
  className,
  type = 'button',
  children,
  ...rest
}: ButtonProps) {
  const classes = ['btn', `btn--${variant}`, large ? 'btn--large' : '', className ?? '']
    .filter(Boolean)
    .join(' ');
  return (
    <button
      {...rest}
      type={type}
      className={classes}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
    >
      {children}
    </button>
  );
}
