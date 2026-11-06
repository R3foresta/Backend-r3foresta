# T1 · Acceso explícito de Recolección

Entrega local del **5 de noviembre de 2026**, autorizada expresamente por el usuario.
Base de código `6f59263` más árbol de trabajo; sin commit de esta entrega.
[Encargo aprobado](../documentacion/tareas/t1-acceso-recoleccion.md),
[OpenAPI generado desde el controller real](recoleccion-acceso-openapi.json) y
[evidencia SQL/HTTP aislada](evidencia/t1-acceso-recoleccion-local-2026-11-05.json).
La [validación final](evidencia/t1-acceso-recoleccion-validacion-2026-11-05.json)
registra build, unitarios y contratos con sus versiones.

> Corte histórico de T1: [T2 local](t2-acceso-viveros.md) amplía revisión documental y DESECHO por vivero con 094/095. Las evidencias T1 no acreditan T2.

## Contrato para T2/T3

Un rol global por cuenta. `ADMIN` activo deriva M1 sin vigencia. `GENERAL` y
`VALIDADOR` activos necesitan una vigencia explícita abierta. Ser afiliado,
participante, coordinador o autor histórico no concede M1. `VOLUNTARIO` y cuenta
inactiva carecen de acceso operativo, aunque conserven historia de una vigencia.
Cambiar rol no elimina filas ni modifica la revisión M1: al volver a un rol interno
activo se vuelve a evaluar la vigencia conservada. Retirar M1 es una acción explícita.

Todas las rutas siguientes usan **Bearer JWT verificado**, cuenta activa y
`Cache-Control: private, no-store`. IDs y revisiones de este contrato son cadenas
decimales BIGINT (máximo `9223372036854775807`). La identidad y autoría privadas se
consultan como texto en PostgREST para evitar redondear cuentas vecinas. No enviar
actor ni rol en el body.

| Método y ruta | Autoridad y resultado |
|---|---|
| `GET /api/v1/me/acceso-recoleccion` | Lectura propia, incluso sin M1 o con rol VOLUNTARIO; muestra acceso efectivo e historial |
| `GET /api/v1/usuarios/:usuario_id/acceso-recoleccion` | Exclusiva ADMIN; consulta una cuenta activa o inactiva |
| `POST /api/v1/usuarios/:usuario_id/acceso-recoleccion/otorgamientos` | Exclusiva ADMIN; destino activo GENERAL/VALIDADOR |
| `POST /api/v1/usuarios/:usuario_id/acceso-recoleccion/retiros` | Exclusiva ADMIN; cierra la vigencia explícita, también de destino inactivo/inelegible/ADMIN |
| `GET /api/v1/recoleccion/accesos/comandos/:comando_id` | Recupera únicamente el recibo del actor autenticado; no exige conservar ADMIN o M1 |

Las lecturas admiten solo `antes_de_id` y `limite` (1–50, omisión 20). Devuelven
`data.usuario_id`, `rol_global`, `activo`, `revision_acceso`, `revision_autoridad`,
`acceso_explicito`, `acceso_efectivo`, `origen` (`ADMIN`, `EXPLICITO`, `SIN_ACCESO`),
`vigencia_actual`, `historial`, `siguiente_antes_de_id` y `observado_en`.
El historial se ordena por ID descendente y registra evento, vigencia, actor,
revisiones, motivo, fecha y UUID del comando. Pasar el cursor devuelto para continuar.

`data.capacidades` contiene `crear`, `mantener_propias`, `confirmar_propias` (siempre
false) y `desechar` (solo ADMIN en T1). Son capacidades M1: no inferir permisos de
Vivero o Plantación de campos ausentes. El DTO cerrado de participación no se amplía.
Los flags `can_*` legados del detalle describen estado; combinarlos con identidad,
capacidades y reglas de servidor, sin tratarlos como concesiones de autoridad.

Ambos POST reciben exactamente:

```json
{
  "comando_id": "00000000-0000-4000-8000-000000000001",
  "revision_esperada": "0",
  "motivo": "Habilitación de captura"
}
```

`comando_id` es UUID v4 en minúsculas. `motivo` se recorta y normaliza a NFC,
3–1000 puntos de código. `revision_esperada` corresponde al **acceso M1**; no usar
`revision_autoridad` del rol global. Sin historia M1 la revisión es `"0"`.
Un cambio real incrementa revisión una vez; un otorgamiento ya vigente o retiro
ya ausente devuelve `SIN_CAMBIOS` conservando revisión y sin otra vigencia/evento.
La intención normalizada queda asociada a `(actor_id, comando_id)`, incluida la
operación. Cambiar destino, revisión, motivo u operación con la misma clave devuelve
409 `COMANDO_REUTILIZADO`. No hay vencimiento ni limpieza automática de claves.

El recibo terminal tiene `comando_id`, `operacion`, `estado` (`CONFIRMADO` o
`RECHAZADO`), `resultado`, `error` y `finalizado_en`. `resultado` describe acceso
**explícito** anterior/nuevo, revisiones anterior/nueva y `cambio`; no es una prueba
de acceso efectivo posterior. Retirar una vigencia de ADMIN conserva su autoridad derivada.

| HTTP / código | Tratamiento |
|---|---|
| 200 `CONFIRMADO` | Cambio o `SIN_CAMBIOS`; refrescar acceso efectivo |
| 403 `CAPACIDAD_INSUFICIENTE` | Actor sin ADMIN; rechazo durable si llegó al ejecutor |
| 404 `RECURSO_NO_VISIBLE` | Cuenta destino inexistente; rechazo durable |
| 409 `REVISION_OBSOLETA` | Releer y confirmar una intención nueva con nueva clave |
| 409 `DESTINO_NO_ELEGIBLE` | No otorgar a ADMIN, VOLUNTARIO o inactivo; rechazo durable |
| 409 `COMANDO_REUTILIZADO` | Error fuera de recibo; conservar la intención original |
| 401 / 403 `CUENTA_INACTIVA` | Recuperar sesión/cuenta; nunca concede autoridad |
| 422 entrada o campo no permitido | Error fuera de recibo, sin mutación |
| 503 `RESULTADO_NO_DETERMINADO` | Conservar UUID e intención; recuperar o repetir exactamente |

Recuperar devuelve 200 para cualquier terminal propio, incluido `RECHAZADO`.
Devuelve 202 `SIN_RESULTADO` y `Retry-After: 2` si aún no encuentra un terminal
propio: puede seguir en curso, no haber llegado o pertenecer a otra cuenta.
No prueba que una intención haya fallado. Una cuenta que perdió ADMIN puede recuperar
su resultado; una cuenta inactiva sigue bloqueada por el guard y por la RPC.

## Persistencia, escrituras y rutas equivalentes

[092](../migrations/092_usuario_acceso_recoleccion.sql) añade vigencias en
`usuario_acceso_recoleccion`, contador `usuario_acceso_recoleccion_revision`,
historial append-only `usuario_acceso_recoleccion_historial` y terminales inmutables
`recoleccion_acceso_comando`. Un índice único parcial impide dos vigencias abiertas.
Retirar cierra la fila; reotorgar crea otra. Cambio, revisión, auditoría y recibo se
confirman juntos. Los rechazos de negocio conservan terminal; infraestructura fallida
conserva incertidumbre. Las tablas nuevas carecen de DML directo del servicio;
las RPC SECURITY DEFINER con search_path fijo solo se ejecutan desde service_role.

[093](../migrations/093_recoleccion_acceso_explicito.sql) aplica M1 a creación,
edición, envío/reenvío y borrado lógico propios; ADMIN conserva autoridad global.
`m1_recoleccion_guardar` confirma ficha, fotos y transiciones de historial juntas;
`revision_captura` interna detecta preparación obsoleta al editar/enviar/aprobar.
Agregar solo fotos bloquea la ficha sin editarla ni incrementar esa revisión.
La revisión legada exige ADMIN/VALIDADOR; **ninguno puede aprobar su propia ficha**.
Rechazar conserva 090, incluido el rechazo antiguo sin ampliar su excepción de fecha.
`DESECHO` exige ADMIN activo en service y RPC, conservando ledger, unidad y saldo.

Orden cooperativo: cuentas por ID ascendente → ficha → evidencias. Las escrituras
M1 mantienen SHARE del actor; otorgar/retirar toma UPDATE del destino, como el cambio
de rol y baja de 072. Así retiro/baja y escritura se serializan. SQL privilegiado
que omita estas RPC queda fuera de esa garantía.

Lista propia y lista por vivero filtran autor antes de contar/paginar. El detalle
autoriza antes de enriquecer ubicación o cargar fotos. ADMIN/VALIDADOR conservan la
lectura de revisión legada hasta T2. En evidencias, atajos por recolección, entidad,
ID y filtros equivalentes comprueban el objeto. Para un usuario sin autoridad de
revisión, la búsqueda genérica sin ámbito excluye M1 antes de contar/paginar;
consultar fotos propias indicando tipo RECOLECCION y su entidad autorizada.
La vía general de carga exige M1/autoría o ADMIN y estado BORRADOR/RECHAZADO.

Fotos siguen por multipart. Storage y las ubicaciones preparadas quedan fuera de
la transacción PostgreSQL: un rechazo SQL confirmado permite limpiar subidas sin
vínculo; una respuesta incierta conserva recursos para evitar referencias rotas.
Pinata/mint siguen después de la aprobación; su fallo no revierte el hecho validado.
Los originales y URLs públicas del bucket existente se conservan: esta entrega no
modifica ni acredita permisos de Storage remoto o revocación de URLs ya emitidas.

## Verificación y límites

Node 24.19.0, npm 12.0.2 y PostgreSQL 14.17 Homebrew en macOS. El runner crea y
elimina su clúster/socket privados, sin TCP, `.env` ni servicios externos. Antecedente
mínimo C/M1, no reconstrucción 001–093 ni cotejo de un Supabase real.

```sh
npm run build
npm run test:unit -- --runInBand
npm run test:db:recoleccion:acceso
node scripts/qa/recoleccion-acceso-openapi.cjs --check
node scripts/qa/pa-int02c-openapi.cjs --check
```

La evidencia registra grupos SQL, carreras con locks observados y nueve casos HTTP
con JWT/RPC reales. Storage, snapshots y adaptación geográfica del harness HTTP son
sintéticos; no acreditan PostGIS, ceremonia WebAuthn, Pinata ni blockchain reales.
Unitarios conservan regresiones de roles globales, Plantación, Banco de semillas e
Impacto. El OpenAPI T1 deriva del controller real; el generador C sigue sin cambios.

**Pendiente:** revisión del usuario/chat revisor, cotejo/aplicación de 092/093 en el
destino, correspondencias reales para conceder accesos y corte coordinado. No se
hizo push, despliegue ni operación remota. Los pre/postflight abortan ante drift y
permisos heredados incompatibles; el catálogo aportado del 4 de noviembre es contexto,
no acreditación de la instalación de estas migraciones.

T2 debe acotar Vivero, revisión legada y DESECHO por establecimiento; T3 añade la
administración visual; T4 la recepción física; T5 plantas externas. T1 no acredita
el aislamiento completo «solo M1», recepción de VALIDADO antiguos ni un corte parcial
listo para producción. Esos incrementos siguen fuera de esta autorización.
