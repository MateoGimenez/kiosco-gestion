# Skills del proyecto

Skills externas instaladas en la Fase 0. Se copiaron desde su repo original y se revisaron antes de agregarlas.
Para actualizar una skill, volvé a copiarla desde su repo y revisá los cambios antes de commitear.

| Skill | Agente | Repo de origen | Commit |
|---|---|---|---|
| `vercel-react-best-practices` | Frontend | [vercel-labs/agent-skills](https://github.com/vercel-labs/agent-skills) | `1a2c79d` |
| `vite` | Frontend | [antfu/skills](https://github.com/antfu/skills) | `f63e9ec` |
| `typescript-advanced-types` | Todos | [wshobson/agents](https://github.com/wshobson/agents) | `4bde316` |
| `nodejs-backend-patterns` | Backend | [wshobson/agents](https://github.com/wshobson/agents) | `4bde316` |
| `api-and-interface-design` | Arquitecto, Backend | [addyosmani/agent-skills](https://github.com/addyosmani/agent-skills) | `301b02b` |
| `postgresql-table-design` | Base de datos | [wshobson/agents](https://github.com/wshobson/agents) | `4bde316` |
| `vitest` | QA | [antfu/skills](https://github.com/antfu/skills) | `f63e9ec` |
| `playwright-best-practices` | QA | [currents-dev/playwright-best-practices-skill](https://github.com/currents-dev/playwright-best-practices-skill) | `283d5cb` |
| `webapp-testing` | QA | [anthropics/skills](https://github.com/anthropics/skills) | `ca45fc4` |
| `security-and-hardening` | Seguridad | [addyosmani/agent-skills](https://github.com/addyosmani/agent-skills) | `301b02b` |
| `create-readme` | Documentación | [github/awesome-copilot](https://github.com/github/awesome-copilot) | `9654314` |
| `openapi-spec-generation` | Documentación, Backend | [wshobson/agents](https://github.com/wshobson/agents) | `4bde316` |
| `prisma-orm-setup` | Base de datos, Backend | [prisma/skills](https://github.com/prisma/skills) | `8ea289b` |
| `prisma-client-api` | Base de datos, Backend | [prisma/skills](https://github.com/prisma/skills) | `8ea289b` |

Notas:
- `vercel-react-best-practices` no trae archivo de licencia; su SKILL.md declara licencia MIT.
- Skills de Anthropic ya disponibles en la sesión (no se copian): `impeccable` (obligatoria para Frontend), `security-review`, `code-review` (solo QA), `engineering:*`, `design:*`.
- Descartada: `usestrix/strix@owasp-top-10-testing` (requiere la herramienta Strix, Docker y una clave de LLM paga).
- ORM elegido en Fase 1: Prisma. No se instalaron `prisma-cli` (solo Prisma 7), `prisma-postgres*` ni `prisma-compute` (servicios en la nube de Prisma) ni las guías de migración de versiones.
