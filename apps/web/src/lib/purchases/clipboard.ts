// Copiar texto al portapapeles. `navigator.clipboard` solo existe en HTTPS o localhost; las tablets
// entran por http://192.168.x.x, así que hay una alternativa con un campo de texto oculto.
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Sin permiso: se prueba la alternativa.
  }
  const area = document.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', '');
  area.style.position = 'fixed';
  area.style.top = '0';
  area.style.opacity = '0';
  document.body.appendChild(area);
  const previous = document.activeElement as HTMLElement | null;
  area.select();
  area.setSelectionRange(0, text.length);
  let ok: boolean;
  try {
    ok = typeof document.execCommand === 'function' && document.execCommand('copy');
  } catch {
    ok = false;
  }
  area.remove();
  previous?.focus?.();
  return ok;
}
