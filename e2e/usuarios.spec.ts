// El dueño crea un usuario y le resetea la contraseña (plan 4.1.6, "Cómo probarlo" pasos 3 y 6).
import { randomPassword, users } from './credentials';
import { expect, test } from './fixtures';
import { loginAs, submitLogin } from './helpers';

test.describe('gestión de usuarios (dueño)', () => {
  test('crear un usuario: aparece en la lista, puede entrar y no puede repetirse el nombre', async ({
    page,
    newContext,
  }) => {
    const password = randomPassword();
    await loginAs(page, users.owner());
    await page
      .getByRole('navigation', { name: 'Principal' })
      .getByRole('link', { name: 'Usuarios' })
      .click();
    await expect(page.getByRole('heading', { name: 'Usuarios', level: 1 })).toBeVisible();

    await page.getByRole('link', { name: 'Nuevo usuario' }).click();
    // Validación en pantalla antes de enviar.
    await page.getByRole('button', { name: 'Crear usuario' }).click();
    await expect(page.getByText('Elegí un rol.')).toBeVisible();

    await page.getByLabel('Usuario').fill('encargada.ana');
    await page.getByLabel('Nombre').fill('Ana Encargada');
    await page.getByLabel('Rol').selectOption({ label: 'Encargado' });
    await page.getByLabel('Contraseña inicial', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Crear usuario' }).click();

    // Se mira solo la ruta: hoy la app deja "?index" en la dirección (ver reporte de QA).
    await expect.poll(() => new URL(page.url()).pathname).toBe('/usuarios');
    await expect(page.getByText('Se creó el usuario Ana Encargada.')).toBeVisible();
    const row = page.getByRole('listitem').filter({ hasText: 'encargada.ana' });
    await expect(row).toContainText('Encargado');
    await expect(row).toContainText('Activo');
    await expect(row).toContainText('Todavía no entró');

    // Repetir el nombre de usuario: error en el campo, sin crear nada.
    await page.getByRole('link', { name: 'Nuevo usuario' }).click();
    await page.getByLabel('Usuario').fill('Encargada.Ana');
    await page.getByLabel('Nombre').fill('Otra Ana');
    await page.getByLabel('Rol').selectOption({ label: 'Empleado' });
    await page.getByLabel('Contraseña inicial', { exact: true }).fill(randomPassword());
    await page.getByRole('button', { name: 'Crear usuario' }).click();
    await expect(page.getByText('Ya existe un usuario con ese nombre.')).toBeVisible();

    // La persona nueva entra con su contraseña inicial, desde otro navegador.
    const other = await (await newContext()).newPage();
    await loginAs(other, { username: 'encargada.ana', password });
    await expect(other.getByRole('heading', { name: 'Hola, Ana Encargada' })).toBeVisible();
    await expect(other.getByText('Entraste como encargado.')).toBeVisible();
    await expect(
      other.getByRole('navigation', { name: 'Principal' }).getByRole('link', { name: 'Usuarios' }),
    ).toHaveCount(0);
  });

  test('resetear la contraseña corta la sesión que el usuario tenía abierta en otro navegador', async ({
    page,
    newContext,
  }) => {
    const oldPassword = randomPassword();
    const newPassword = randomPassword();

    // 1. El dueño crea al usuario desde la pantalla.
    await loginAs(page, users.owner());
    await page.goto('/usuarios/nuevo');
    await page.getByLabel('Usuario').fill('juan.reset');
    await page.getByLabel('Nombre').fill('Juan Reseteo');
    await page.getByLabel('Rol').selectOption({ label: 'Empleado' });
    await page.getByLabel('Contraseña inicial', { exact: true }).fill(oldPassword);
    await page.getByRole('button', { name: 'Crear usuario' }).click();
    await expect(page.getByText('Se creó el usuario Juan Reseteo.')).toBeVisible();

    // 2. El usuario entra desde otro navegador (por ejemplo, su celular) y queda adentro.
    const phone = await newContext();
    const phonePage = await phone.newPage();
    await loginAs(phonePage, { username: 'juan.reset', password: oldPassword });
    expect((await phone.request.get('/api/auth/me')).status()).toBe(200);

    // 3. El dueño le resetea la contraseña (con confirmación).
    await page.getByRole('link', { name: 'Editar a Juan Reseteo' }).click();
    await expect(page.getByRole('heading', { name: 'Editar a Juan Reseteo' })).toBeVisible();
    await page.getByLabel('Contraseña nueva', { exact: true }).fill(newPassword);
    await page.getByRole('button', { name: 'Resetear contraseña' }).click();
    const dialog = page.getByRole('dialog', { name: '¿Resetear la contraseña de Juan Reseteo?' });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Resetear contraseña' }).click();
    await expect(page.getByText('Se cambió la contraseña. Pasásela a la persona.')).toBeVisible();

    // 4. La sesión del celular ya no vale: la API responde 401 y la pantalla vuelve al login.
    const me = await phone.request.get('/api/auth/me');
    expect(me.status()).toBe(401);
    expect((await me.json()).error.code).toBe('UNAUTHENTICATED');
    await phonePage.reload();
    await expect(phonePage.getByRole('heading', { name: 'Entrar' })).toBeVisible();
    await expect(phonePage.getByRole('heading', { name: /^Hola, / })).toHaveCount(0);

    // 5. La clave vieja ya no sirve; la nueva sí.
    await submitLogin(phonePage, { username: 'juan.reset', password: oldPassword });
    await expect(phonePage.getByText('Usuario o contraseña incorrectos')).toBeVisible();
    await submitLogin(phonePage, { username: 'juan.reset', password: newPassword });
    await expect(phonePage.getByRole('heading', { name: 'Hola, Juan Reseteo' })).toBeVisible();

    // 6. La sesión del dueño sigue abierta (solo se cortaron las del usuario reseteado).
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Editar a Juan Reseteo' })).toBeVisible();
  });

  test('desactivar a un usuario le corta la sesión y no lo deja volver a entrar; reactivar sí', async ({
    page,
    newContext,
  }) => {
    const password = randomPassword();
    await loginAs(page, users.owner());
    await page.goto('/usuarios/nuevo');
    await page.getByLabel('Usuario').fill('sofi.baja');
    await page.getByLabel('Nombre').fill('Sofía Baja');
    await page.getByLabel('Rol').selectOption({ label: 'Encargado' });
    await page.getByLabel('Contraseña inicial', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Crear usuario' }).click();
    await expect(page.getByText('Se creó el usuario Sofía Baja.')).toBeVisible();

    const other = await newContext();
    const otherPage = await other.newPage();
    await loginAs(otherPage, { username: 'sofi.baja', password });

    await page.getByRole('button', { name: 'Desactivar a Sofía Baja' }).click();
    await page
      .getByRole('dialog', { name: '¿Desactivar a Sofía Baja?' })
      .getByRole('button', { name: 'Desactivar' })
      .click();
    await expect(page.getByText('Se desactivó a Sofía Baja.')).toBeVisible();
    await expect(page.getByRole('listitem').filter({ hasText: 'sofi.baja' })).toContainText(
      'Desactivado',
    );

    expect((await other.request.get('/api/auth/me')).status()).toBe(401);
    await otherPage.reload();
    await expect(otherPage.getByRole('heading', { name: 'Entrar' })).toBeVisible();
    await submitLogin(otherPage, { username: 'sofi.baja', password });
    await expect(otherPage.getByText('Usuario o contraseña incorrectos')).toBeVisible();

    await page.getByRole('button', { name: 'Reactivar a Sofía Baja' }).click();
    await expect(page.getByText('Se reactivó a Sofía Baja.')).toBeVisible();
    await submitLogin(otherPage, { username: 'sofi.baja', password });
    await expect(otherPage.getByRole('heading', { name: 'Hola, Sofía Baja' })).toBeVisible();
  });
});
