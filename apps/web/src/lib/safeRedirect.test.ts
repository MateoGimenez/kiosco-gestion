import { describe, expect, it } from 'vitest';
import { safeInternalPath } from './safeRedirect';

describe('safeInternalPath', () => {
  it('conserva la ruta interna con su query string', () => {
    expect(safeInternalPath('/usuarios?activos=1')).toBe('/usuarios?activos=1');
  });
  it.each([
    ['//otro-sitio.com'],
    ['https://otro-sitio.com'],
    ['/\\otro-sitio.com'],
    ['javascript:alert(1)'],
    ['/a\nb'],
    ['/login'],
    ['/login?x=1'],
    [undefined],
    [42],
  ])('descarta %s y vuelve al inicio', (value) => {
    expect(safeInternalPath(value)).toBe('/');
  });
});
