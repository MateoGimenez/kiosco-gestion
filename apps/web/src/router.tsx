import { createBrowserRouter, type RouteObject } from 'react-router';
import { AppLayout } from './layout/AppLayout';
import { RequireAuth, RequireRole } from './layout/RequireAuth';
import { ChangePasswordPage } from './pages/ChangePasswordPage';
import { HomePage } from './pages/HomePage';
import { LoginPage } from './pages/LoginPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { CategoriesPage } from './pages/CategoriesPage';
import { PricingDetailPage } from './pages/PricingDetailPage';
import { PricingPage } from './pages/PricingPage';
import { ProductDetailPage } from './pages/ProductDetailPage';
import { ProductFormPage } from './pages/ProductFormPage';
import { ProductsPage } from './pages/ProductsPage';
import { RestockPage } from './pages/RestockPage';
import { SettingsPage } from './pages/SettingsPage';
import { StockAdjustPage } from './pages/StockAdjustPage';
import { StockMovementsPage } from './pages/StockMovementsPage';
import { UserFormPage } from './pages/UserFormPage';
import { UsersPage } from './pages/UsersPage';
import { PASSWORD_ROUTE } from './lib/routes';

const MANAGER_ROLES = ['OWNER', 'MANAGER'] as const;

// Se exporta la lista de rutas para poder armar el router también en los tests.
export const appRoutes: RouteObject[] = [
  { path: '/login', element: <LoginPage /> },
  {
    element: <RequireAuth />,
    children: [
      {
        element: <AppLayout />,
        children: [
          { path: '/', element: <HomePage /> },
          { path: PASSWORD_ROUTE, element: <ChangePasswordPage /> },
          // Productos: la lista y la ficha las ven todos (el empleado, sin costos).
          { path: '/productos', element: <ProductsPage /> },
          { path: '/productos/:id', element: <ProductDetailPage /> },
          {
            element: <RequireRole roles={MANAGER_ROLES} />,
            children: [
              { path: '/productos/nuevo', element: <ProductFormPage /> },
              { path: '/productos/:id/editar', element: <ProductFormPage /> },
              { path: '/productos/:id/ajustar', element: <StockAdjustPage /> },
              { path: '/productos/:id/movimientos', element: <StockMovementsPage /> },
              { path: '/pricing', element: <PricingPage /> },
              { path: '/pricing/:id', element: <PricingDetailPage /> },
              { path: '/categorias', element: <CategoriesPage /> },
              { path: '/reponer', element: <RestockPage /> },
            ],
          },
          {
            path: '/configuracion',
            element: <RequireRole roles={['OWNER']} />,
            children: [{ index: true, element: <SettingsPage /> }],
          },
          {
            path: '/usuarios',
            element: <RequireRole roles={['OWNER']} />,
            children: [
              { index: true, element: <UsersPage /> },
              { path: 'nuevo', element: <UserFormPage /> },
              { path: ':id', element: <UserFormPage /> },
            ],
          },
          { path: '*', element: <NotFoundPage /> },
        ],
      },
    ],
  },
];

export const router = createBrowserRouter(appRoutes);
