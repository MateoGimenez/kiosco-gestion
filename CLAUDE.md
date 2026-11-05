# Kiosco – Sistema de gestión

Sistema de gestión para un kiosco: ventas, stock, proveedores, compras, precios, caja, clientes/fiado, usuarios y reportes.

## Stack (confirmado en Fase 1)

- **TypeScript** en todo el proyecto
- **Frontend:** React + Vite
- **Backend:** Node.js + Express
- **Base de datos:** PostgreSQL (en desarrollo, con Docker)
- **ORM:** Prisma
- **Login:** propio, JWT en cookie `httpOnly` + contraseñas con bcrypt
- **Tests:** Vitest (unitarios e integración) y Playwright (e2e)

## Cómo se trabaja

La sesión principal es el **Orquestador**: coordina a los agentes de `.claude/agents/` y no escribe código de la aplicación por su cuenta.

| Agente | Modelo | Rol |
|---|---|---|
| `arquitecto` | opus | Estructura, decisiones técnicas, modelo de datos, documentos de diseño |
| `backend` | sonnet | API Express, validaciones, lógica de negocio |
| `base-datos` | sonnet | Esquema Prisma, migraciones, seeds, índices |
| `frontend` | sonnet | Interfaz React. Usa **siempre** `/impeccable` |
| `qa` | sonnet | Tests unitarios, de integración y e2e |
| `seguridad` | opus | Auth, roles y permisos, revisión de vulnerabilidades |
| `documentacion` | haiku | README, documentación de la API, manual de uso |

Las skills externas están en `.claude/skills/` (origen y versión en `.claude/skills/FUENTES.md`).

### Fases

0. Buscar skills ✅
1. Definir el equipo de agentes ✅
2. Relevamiento del negocio → `docs/requisitos.md` y `docs/modelo-datos.md`
3. Plan de trabajo → `docs/plan.md`
4. Desarrollo, etapa por etapa. Al cerrar cada etapa, `qa` corre los tests y `seguridad` hace una revisión rápida.

**No se escribe código de la aplicación hasta aprobar las fases 0, 1 y 2.** Al final de cada fase se muestra un resumen y se espera la aprobación del dueño del proyecto.

## Reglas generales

- **Nunca asumir reglas de negocio.** Si algo no está en `docs/requisitos.md`, frenar y preguntar.
- Comentarios y documentación **en español**. Nombres de variables, funciones, tablas y archivos de código **en inglés**.
- Commits chicos y descriptivos, uno por avance. Los hace el Orquestador.
- Nada de claves ni datos sensibles en el código: usar `.env` (ignorado por git) y mantener actualizado `.env.example`.
- Explicar las decisiones técnicas de forma simple, sin jerga innecesaria.
- Dinero: nunca usar `float`. Usar `Decimal` de Prisma (columna `numeric`) o centavos enteros, según decida el arquitecto.
