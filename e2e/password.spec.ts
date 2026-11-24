// Contraseña obligatoria (H-21): el dueño crea un usuario, que al entrar tiene que elegir la suya.
import { randomPassword, users } from './credentials';
import { expect, test } from './fixtures';
import { loginAs, submitLogin } from './helpers';

test.describe('cambio de contraseña obligatorio', () => {
  test('el usuario nuevo cae en "Elegí tu nueva contraseña", la cambia y ve el inicio', async ({
    page,
    newContext,
  }) => {
    const initial = randomPassword();
    const chosen = randomPassword();

    // El dueño crea al usuario desde la pantalla.
    await loginAs(page, users.owner());
    await page.goto('/usuarios/nuevo');
    await page.getByLabel('Usuario').fill('nuevo.clave');
    await page.getByLabel('Nombre').fill('Nora Nueva');
    await page.getByLabel('Rol').selectOption({ label: 'Empleado' });
    await page.getByLabel('Contraseña inicial', { exact: true }).fill(initial);
    await page.getByRole('button', { name: 'Crear usuario' }).click();
    await expect(page.getByText('Se creó el usuario Nora Nueva.')).toBeVisible();

    // La persona entra con la contraseña que le pasaron: cae en la pantalla de cambio.
    const other = await (await newContext()).newPage();
    await other.goto('/');
    await expect(other.getByRole('heading', { name: 'Entrar' })).toBeVisible();
    await submitLogin(other, { username: 'nuevo.clave', password: initial });
    await expect(other.getByRole('heading', { name: 'Elegí tu nueva contraseña' })).toBeVisible();
    await expect(other.getByText('Tu contraseña la puso otra persona.')).toBeVisible();

    // No puede ir a otra pantalla por la dirección.
    await other.goto('/usuarios');
    await expect(other.getByRole('heading', { name: 'Elegí tu nueva contraseña' })).toBeVisible();

    await other.goto('/');
    await expect(other.getByRole('heading', { name: 'Elegí tu nueva contraseña' })).toBeVisible();

    // Una contraseña actual equivocada se marca en su campo.
    await other.getByLabel('Contraseña actual', { exact: true }).fill('no-es-esta-123');
    await other.getByLabel('Contraseña nueva', { exact: true }).fill(chosen);
    await other.getByLabel('Repetí la contraseña nueva', { exact: true }).fill(chosen);
    await other.getByRole('button', { name: 'Cambiar contraseña' }).click();
    await expect(other.getByText(/La contraseña actual no es correcta/)).toBeVisible();

    // Con la correcta, la cambia y ve el inicio.
    await other.getByLabel('Contraseña actual', { exact: true }).fill(initial);
    await other.getByRole('button', { name: 'Cambiar contraseña' }).click();
    await expect(other.getByRole('heading', { name: 'Hola, Nora Nueva' })).toBeVisible();
    await expect(other.getByRole('link', { name: 'Cambiar mi contraseña' })).toBeVisible();

    // La contraseña nueva ya sirve para entrar, y ya no la pide de nuevo.
    await other.getByRole('button', { name: 'Cambiar usuario' }).click();
    await submitLogin(other, { username: 'nuevo.clave', password: chosen });
    await expect(other.getByRole('heading', { name: 'Hola, Nora Nueva' })).toBeVisible();
  });
});
