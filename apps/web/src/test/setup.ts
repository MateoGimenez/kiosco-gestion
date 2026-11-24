// Configuración común de los tests de pantallas.
import '@testing-library/jest-dom/vitest';
import { cleanup, configure } from '@testing-library/react';
import { afterEach } from 'vitest';

// Los `findBy*` y `waitFor` esperan un estado, no un tiempo fijo: con la máquina cargada el
// primer dibujo de la app puede tardar más de 1 s (el valor por defecto). Con 10 s no se
// vuelven lentos (terminan apenas se cumple la condición) y dejan de fallar por apuro.
configure({ asyncUtilTimeout: 10_000 });

afterEach(() => cleanup());
