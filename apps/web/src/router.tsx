import { createBrowserRouter, type RouteObject } from 'react-router';
import { AppLayout } from './layout/AppLayout';
import { RequireAuth, RequireRole } from './layout/RequireAuth';
import { ChangePasswordPage } from './pages/ChangePasswordPage';
import { HomePage } from './pages/HomePage';
import { LoginPage } from './pages/LoginPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { CashDetailPage } from './pages/CashDetailPage';
import { CashListPage } from './pages/CashListPage';
import { CloseCashPage } from './pages/CloseCashPage';
import { CategoriesPage } from './pages/CategoriesPage';
import { PricingDetailPage } from './pages/PricingDetailPage';
import { PricingPage } from './pages/PricingPage';
import { ProductDetailPage } from './pages/ProductDetailPage';
import { ProductFormPage } from './pages/ProductFormPage';
import { ProductsPage } from './pages/ProductsPage';
import { SaleDetailPage } from './pages/SaleDetailPage';
import { SalePage } from './pages/SalePage';
import { SalesListPage } from './pages/SalesListPage';
import { RestockPage } from './pages/RestockPage';
import { SettingsPage } from './pages/SettingsPage';
import { StockAdjustPage } from './pages/StockAdjustPage';
import { StockMovementsPage } from './pages/StockMovementsPage';
import { UserFormPage } from './pages/UserFormPage';
import { UsersPage } from './pages/UsersPage';
import { PurchaseDetailPage } from './pages/PurchaseDetailPage';
import { PurchaseNewPage } from './pages/PurchaseNewPage';
import { PurchasesPage } from './pages/PurchasesPage';
import { SupplierDetailPage } from './pages/SupplierDetailPage';
import { SupplierFormPage } from './pages/SupplierFormPage';
import { SupplierOrderPage } from './pages/SupplierOrderPage';
import { SupplierProductsPage } from './pages/SupplierProductsPage';
import { SuppliersPage } from './pages/SuppliersPage';
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
          // Vender: todos los roles (el servidor no deja vender desde afuera del local).
          { path: '/vender', element: <SalePage /> },
          // Cerrar la caja: todos los roles (el empleado, solo la que abrió; lo controla el servidor).
          { path: '/caja/cerrar', element: <CloseCashPage /> },
          { path: '/productos', element: <ProductsPage /> },
          { path: '/productos/:id', element: <ProductDetailPage /> },
          {
            element: <RequireRole roles={MANAGER_ROLES} />,
            children: [
              { path: '/caja', element: <CashListPage /> },
              { path: '/caja/:id', element: <CashDetailPage /> },
              { path: '/ventas', element: <SalesListPage /> },
              { path: '/ventas/:id', element: <SaleDetailPage /> },
              { path: '/productos/nuevo', element: <ProductFormPage /> },
              { path: '/productos/:id/editar', element: <ProductFormPage /> },
              { path: '/productos/:id/ajustar', element: <StockAdjustPage /> },
              { path: '/productos/:id/movimientos', element: <StockMovementsPage /> },
              { path: '/pricing', element: <PricingPage /> },
              { path: '/pricing/:id', element: <PricingDetailPage /> },
              { path: '/categorias', element: <CategoriesPage /> },
              { path: '/reponer', element: <RestockPage /> },
              { path: '/compras', element: <PurchasesPage /> },
              { path: '/compras/nueva', element: <PurchaseNewPage /> },
              { path: '/compras/:id', element: <PurchaseDetailPage /> },
              { path: '/proveedores', element: <SuppliersPage /> },
              { path: '/proveedores/nuevo', element: <SupplierFormPage /> },
              { path: '/proveedores/:id', element: <SupplierDetailPage /> },
              { path: '/proveedores/:id/editar', element: <SupplierFormPage /> },
              { path: '/proveedores/:id/productos', element: <SupplierProductsPage /> },
              { path: '/proveedores/:id/pedido', element: <SupplierOrderPage /> },
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
