import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../lib/api';
import { ErrorMessage } from './ErrorMessage';

describe('ErrorMessage', () => {
  it('muestra el mensaje en español de un error de la API', () => {
    render(<ErrorMessage error={new ApiError(500, 'INTERNAL_ERROR', 'Algo salió mal.')} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Algo salió mal.');
  });

  it('ofrece reintentar solo si se pasa la acción', async () => {
    const onRetry = vi.fn();
    const { rerender } = render(<ErrorMessage />);
    expect(screen.queryByRole('button')).toBeNull();
    rerender(<ErrorMessage onRetry={onRetry} />);
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(onRetry).toHaveBeenCalledOnce();
  });
});
