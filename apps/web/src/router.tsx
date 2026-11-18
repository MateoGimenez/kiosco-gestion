import { createBrowserRouter, type RouteObject } from 'react-router';
import { AppLayout } from './layout/AppLayout';
import { RequireAuth, RequireRole } from './layout/RequireAuth';
import { HomePage } from './pages/HomePage';
import { LoginPage } from './pages/LoginPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { UserFormPage } from './pages/UserFormPage';
import { UsersPage } from './pages/UsersPage';

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
