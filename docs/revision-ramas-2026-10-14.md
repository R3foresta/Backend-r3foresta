# Revisión de ramas — 14 de octubre de 2026

Revisión de todas las ramas locales y referencias remotas de los tres repositorios después de actualizar y depurar referencias de origin. Comparación con origin/main mediante ascendencia Git y equivalencia de parches (git cherry). No se fusionaron ni eliminaron ramas. Las referencias ya eliminadas del servidor se depuraron con fetch --prune.

Los nombres históricos se muestran por su nombre final y SHA para identificarlos sin añadir prefijos a esta entrega. main y la referencia simbólica origin/HEAD se excluyen del recuento.

| Repositorio | Referencias revisadas | Integradas por historial | No integradas |
|---|---:|---:|---:|
| Backend-r3foresta | 6 | 4 | 2 |
| pwa-r3foresta | 9 | 7 | 2 |
| r3foresta-docs | 12 | 9 | 3 |

## Backend-r3foresta

| Rama | Ámbito | Punta | Integrada en main | Commits propios no equivalentes |
|---|---|---|---|---:|
| `dev` | Local | `4745283` | Sí | 0 |
| `impacto` | Local | `5b62ff3` | No | 4 |
| `origin/recolection` | Local | `2453617` | Sí | 0 |
| `int02a-entrega-2026-10-13` | Remota | `b0b6697` | Sí | 0 |
| `dev` | Remota | `22f64eb` | Sí | 0 |
| `impacto` | Remota | `5b62ff3` | No | 4 |

## pwa-r3foresta

| Rama | Ámbito | Punta | Integrada en main | Commits propios no equivalentes |
|---|---|---|---|---:|
| `plan-editor-lco-qa` | Local | `a2b706c` | Sí | 0 |
| `plan-refresh-cleanup` | Local | `624004e` | Sí | 0 |
| `reuse-plan-form` | Local | `9aa1d06` | Sí | 0 |
| `dev` | Local | `574b76e` | No | 2 |
| `review/code-audit-2026-07-01` | Local | `d0a3119` | No | 1 |
| `plan-editor-lco-qa` | Remota | `a2b706c` | Sí | 0 |
| `plan-refresh-cleanup` | Remota | `624004e` | Sí | 0 |
| `reuse-plan-form` | Remota | `9aa1d06` | Sí | 0 |
| `dev` | Remota | `88fc481` | Sí | 0 |

## r3foresta-docs

| Rama | Ámbito | Punta | Integrada en main | Commits propios no equivalentes |
|---|---|---|---|---:|
| `actualizacion-perfil-grado` | Local | `d0bead6` | Sí | 0 |
| `docs-plan-063` | Local | `6879ab8` | Sí | 0 |
| `integrar-capitulos-1-2-r3foresta` | Local | `1a5cb3c` | Sí | 0 |
| `reforzar-proyeccion-carbono-perfil` | Local | `3f42290` | No | 9 |
| `feature/flujo-recoleccion-miguel` | Local | `051ac18` | Sí | 0 |
| `pablo-schemas` | Local | `1b55fe9` | Sí | 0 |
| `actualizacion-perfil-grado` | Remota | `d0bead6` | Sí | 0 |
| `int02a-entrega-2026-10-13` | Remota | `3f69b20` | Sí | 0 |
| `integrar-capitulos-1-2-r3foresta` | Remota | `1a5cb3c` | Sí | 0 |
| `reforzar-proyeccion-carbono-perfil` | Remota | `3f42290` | No | 9 |
| `feature/flujo-recoleccion-miguel` | Remota | `84e968a` | No | 3 |
| `pablo-schemas` | Remota | `1b55fe9` | Sí | 0 |

## Pendientes identificados

- Backend: impacto, local y remota, contiene 4 commits propios y un merge no integrados. main ya tiene una API pública de Impacto; la rama incorpora ampliaciones de seguimiento/evidencia que requieren revisión independiente.
- PWA: dev local conserva 2 commits de Recolección; dev remoto sí está integrado. La rama local review/code-audit-2026-07-01 conserva un commit de informe.
- Documentación: reforzar-proyeccion-carbono-perfil, local y remota, conserva 9 commits propios y 2 merges. feature/flujo-recoleccion-miguel remota conserva 3 commits; su referencia local anterior sí está integrada.

No se encontraron parches individuales equivalentes en main para esos commits propios. Esto no sustituye una revisión semántica de posibles cambios reimplementados o combinados; las ramas pendientes no deben borrarse basándose en este inventario.
