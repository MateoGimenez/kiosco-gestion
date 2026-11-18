// Login, "Cambiar usuario", login fallido y bloqueo (plan 4.1.6, "Cómo probarlo" pasos 2, 4 y 5).
import { EMPLOYEE_FULL_NAME, OWNER_FULL_NAME, users } from './credentials';
import { expect, test } from './fixtures';
import { loginAs, submitLogin } from './helpers';

test.describe('login', () => {
  test('el dueño entra y ve el menú de usuarios', async ({ page, context }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/login$/);
    await submitLogin(page, users.owner());

    await expect(page.getByRole('heading', { name: `Hola, ${OWNER_FULL_NAME}` })).toBeVisible();
    await expect(page.getByText('Entraste como dueño.')).toBeVisible();
    const menu = page.getByRole('navigation', { name: 'Principal' });
    await expect(menu.getByRole('link', { name: 'Usuarios' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Cambiar usuario' })).toBeVisible();

    // La sesión vive en una cookie httpOnly: el JavaScript de la página no la puede leer.
    const cookies = await context.cookies();
    const session = cookies.find((c) => c.name === 'kiosco_sid');
    expect(session?.httpOnly).toBe(true);
    expect(session?.sameSite).toBe('Strict');
    expect(await page.evaluate(() => document.cookie)).not.toContain('kiosco_sid');
  });

  test('con la sesión abierta, recargar no vuelve a pedir la clave', async ({ page }) => {
    await loginAs(page, users.owner());
    await page.reload();
    await expect(page.getByRole('heading', { name: `Hola, ${OWNER_FULL_NAME}` })).toBeVisible();
  });

  test('sin sesión, una pantalla interna redirige al login y después vuelve a ella', async ({
    page,
  }) => {
    await page.goto('/usuarios');
    await expect(page).toHaveURL(/\/login$/);
    await submitLogin(page, users.owner());
    await expect(page).toHaveURL(/\/usuarios$/);
    await expect(page.getByRole('heading', { name: 'Usuarios', level: 1 })).toBeVisible();
  });
});

test.describe('cambiar usuario y permisos por rol', () => {
  test('"Cambiar usuario" cierra la sesión del dueño y el empleado no ve "Usuarios"', async ({
    page,
  }) => {
    await loginAs(page, users.owner());
    await page.getByRole('button', { name: 'Cambiar usuario' }).click();
    await expect(page.getByRole('heading', { name: 'Entrar' })).toBeVisible();
    // Quien entra después no ve nada de lo anterior.
    await expect(page.getByText(OWNER_FULL_NAME)).toHaveCount(0);

    await submitLogin(page, users.employee());
    await expect(page.getByRole('heading', { name: `Hola, ${EMPLOYEE_FULL_NAME}` })).toBeVisible();
    await expect(page.getByText('Entraste como empleado.')).toBeVisible();

    const menu = page.getByRole('navigation', { name: 'Principal' });
    await expect(menu.getByRole('link', { name: 'Inicio' })).toBeVisible();
    await expect(menu.getByRole('link', { name: 'Usuarios' })).toHaveCount(0);
  });

  test('el empleado no puede entrar a Usuarios por URL directa ni por la API', async ({ page }) => {
    await loginAs(page, users.employee());

    await page.goto('/usuarios');
    await expect(
      page.getByRole('heading', { name: 'No tenés permiso para ver esta pantalla' }),
    ).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Usuarios', level: 1 })).toHaveCount(0);

    await page.goto('/usuarios/nuevo');
    await expect(
      page.getByRole('heading', { name: 'No tenés permiso para ver esta pantalla' }),
    ).toBeVisible();
    await expect(page.getByLabel('Contraseña inicial', { exact: true })).toHaveCount(0);

    // Aunque se salte la pantalla, el servidor responde 403 (los permisos se validan en la API).
    const list = await page.request.get('/api/users');
    expect(list.status()).toBe(403);
    expect((await list.json()).error.code).toBe('FORBIDDEN');
    expect(JSON.stringify(await list.json())).not.toMatch(/passwordHash/);
  });

  test('al cerrar la sesión, las pantallas internas dejan de estar disponibles', async ({
    page,
  }) => {
    await loginAs(page, users.owner());
    await page.getByRole('button', { name: 'Cambiar usuario' }).click();
    await expect(page.getByRole('heading', { name: 'Entrar' })).toBeVisible();
    await page.goto('/usuarios');
    await expect(page).toHaveURL(/\/login$/);
    expect((await page.request.get('/api/users')).status()).toBe(401);
  });
});

test.describe('login fallido y bloqueo', () => {
  test('clave incorrecta: mensaje claro, cuenta los intentos y deja volver a probar', async ({
    page,
  }) => {
    await page.goto('/');
    await submitLogin(page, { username: users.employee().username, password: 'clave-equivocada' });

    await expect(page.getByText('Usuario o contraseña incorrectos')).toBeVisible();
    await expect(
      page.getByText('Te quedan 4 intentos antes de que se bloquee el acceso.'),
    ).toBeVisible();
    await expect(page).toHaveURL(/\/login$/);
    // La contraseña se borra y el cursor queda ahí para reintentar.
    await expect(page.getByLabel('Contraseña', { exact: true })).toHaveValue('');
    await expect(page.getByLabel('Contraseña', { exact: true })).toBeFocused();

    // Con la clave correcta entra (y el contador se borra).
    await page.getByLabel('Contraseña', { exact: true }).fill(users.employee().password);
    await page.getByRole('button', { name: 'Entrar' }).click();
    await expect(page.getByRole('heading', { name: `Hola, ${EMPLOYEE_FULL_NAME}` })).toBeVisible();
  });

  test('un usuario que no existe recibe el mismo mensaje (no se revela quién existe)', async ({
    page,
  }) => {
    await page.goto('/');
    await submitLogin(page, { username: 'nadie.existe', password: 'clave-equivocada' });
    await expect(page.getByText('Usuario o contraseña incorrectos')).toBeVisible();
    await expect(
      page.getByText('Te quedan 4 intentos antes de que se bloquee el acceso.'),
    ).toBeVisible();
  });

  test('campos vacíos: avisa en cada campo y no envía nada', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Entrar' }).click();
    await expect(page.getByText('Ingresá tu usuario.')).toBeVisible();
    await expect(page.getByText('Ingresá tu contraseña.')).toBeVisible();
    await expect(page).toHaveURL(/\/login$/);
  });

  test('tras 5 intentos fallidos el acceso se bloquea, incluso con la clave correcta', async ({
    page,
  }) => {
    const user = users.lockable();
    await page.goto('/');

    for (let attempt = 1; attempt <= 4; attempt++) {
      await submitLogin(page, { username: user.username, password: 'clave-equivocada' });
      const left = 5 - attempt;
      await expect(
        page.getByText(
          left === 1
            ? 'Te queda 1 intento antes de que se bloquee el acceso.'
            : `Te quedan ${left} intentos antes de que se bloquee el acceso.`,
        ),
      ).toBeVisible();
    }

    await submitLogin(page, { username: user.username, password: 'clave-equivocada' });
    await expect(page.getByText('Demasiados intentos: el acceso está bloqueado')).toBeVisible();
    await expect(page.getByText('Probá de nuevo en 15 minutos.')).toBeVisible();

    // Bloqueado: la clave correcta tampoco entra mientras dure el bloqueo.
    await submitLogin(page, user);
    await expect(page.getByText('Demasiados intentos: el acceso está bloqueado')).toBeVisible();
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole('heading', { name: /^Hola, / })).toHaveCount(0);

    // El bloqueo es de ese usuario: otro usuario entra normalmente.
    await page.getByLabel('Usuario').fill(users.owner().username);
    await page.getByLabel('Contraseña', { exact: true }).fill(users.owner().password);
    await page.getByRole('button', { name: 'Entrar' }).click();
    await expect(page.getByRole('heading', { name: `Hola, ${OWNER_FULL_NAME}` })).toBeVisible();
  });
});
