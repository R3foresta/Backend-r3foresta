# INT07 · Participantes históricos y lecturas

Incremento local del 22 de octubre de 2026 sobre el commit `1585b4c` más árbol.
Completa el alcance de participantes de BE03 mediante la migración aditiva085;
no modifica084 aplicada. Cantidades, reversiones, frontera de alta de mortandad,
resto de BE02/BE04–BE08, frontend y QA integrado de INT07 siguen pendientes.
SQL085 aplicado/cotejado en destino, push, despliegue y HTTP remoto se acreditan
por separado. [Estado canónico](../../r3foresta-docs/specs/plantacion/participacion-aliada/implementacion/pa-t-int07.md).

## Contrato consumible

Las rutas privadas requieren actor verificado y cuenta activa, usan RPC con
cliente administrativo y devuelven `private, no-store`/`Vary: Authorization`.
La señal pública funciona sin sesión, incluida una cabecera bearer vencida,
y usa `no-store` también en errores. [OpenAPI](pa-int02c-openapi.json).

| Método y ruta bajo `/api/v1` | Alcance |
|---|---|
| POST `/plantaciones/:id/correcciones/participantes` | Reemplaza el conjunto efectivo de corresponsables; ADMIN global o administrador vigente de la subcampaña exacta. Revalida ámbito ACTIVA, registro VIGENTE y revisión. |
| GET `/plantaciones/:id/participantes-historicos-seleccionables` | Búsqueda autorizada por ID exacto o nombre; incluye inactivos y excluye al responsable. |
| GET `/plantaciones/:id/contexto-correccion` | Original/efectivo con participantes y capacidades de observaciones/participantes. Contextual conserva observaciones null. |
| GET `/plantaciones/:id/historial-correcciones` | Unión de observaciones y participantes. Antes/después, motivo y actor de participantes visibles a ambas autoridades; textos de observaciones restringidos a ADMIN global. |
| GET `/plantaciones/:id/estado-propio` | Cantidad original/efectiva, revisiones y participantes con procedencia, por autoría o participación efectiva. |
| GET `/plantaciones/:id/historial-propio` | Historia reducida por relación propia, sin motivo ni valores antes/después. |
| GET `/plantaciones/mis-registros/estado` | Una fila por registro propio efectivo, sin exigir permiso operativo. |
| GET `/impact/registros/:id/estado` | Señal pública mínima de corrección/estado y enlace elegible; sin participantes ni auditoría privada. |

POST cerrado, todos los campos obligatorios:

```json
{
  "comando_id": "1a370000-0000-4000-8000-000000000002",
  "revision_esperada": "1",
  "motivo": "Corregir la lista histórica",
  "coresponsable_ids": ["12", "9007199254740993"]
}
```

El conjunto admite cero a100 IDs BIGINT canónicos en cadenas, sin duplicados;
se ordena numéricamente para canonicalizar la intención. No recibe al responsable,
actor, rol ni ámbito. Motivo NFC/trim de3–1000 caracteres. Incluir al responsable
produce rechazo durable422 `CASO_NO_SOPORTADO`; usuario inexistente produce
`PARTICIPANTE_NO_REGISTRADO`. Cuenta inactiva y ausencia de permiso operativo del
participante son admisibles; no lo reactivan ni conceden acceso operativo.

Recuperación común con
`GET /participacion/comandos/:comando_id?operacion=CORREGIR_PARTICIPANTES_PLANTACION`.
El recibo contiene caso, objeto, ámbito, revisiones y resultado; no contiene
listas, nombres ni motivo. Replay terminal propio precede a nueva autorización.
`SIN_CAMBIOS` no materializa overlay, no crea historia y no cambia revisiones.

Selector: `q` obligatorio, ID decimal canónico exacto desde un carácter o nombre
NFC/trim de3–100 caracteres. Coincidencia literal sin distinguir mayúsculas;
sin correo, username, comodines ni directorio sin filtro. Devuelve ID,
`nombre_actual`, actividad y relación histórica. Orden ID ASC; `limite`20,
máximo50. Cursores firmados ligados a actor, sesión, registro, audiencia, modo y
consulta normalizada. Historial y páginas propias usan ID DESC y cursores de su
audiencia. Cada página revalida autoridad o relación propia.

## Datos y proyecciones

Originales y snapshots se conservan. Alta histórica captura nombre y fecha de
corrección, expuestos como `nombre_capturado_correccion` y `capturado_en` en el
nuevo contrato; nunca los presenta como nombre o afiliación pasados. El contrato
INT05 mantiene sus campos: alta histórica devuelve `nombre_snapshot:null` y
`afiliacion_estado:HISTORICA_NO_DISPONIBLE`. Restaurar reutiliza exactamente el
snapshot anterior, aunque el perfil haya cambiado. El responsable se conserva
una sola vez y siempre con procedencia ORIGINAL.

Una retirada extingue acceso propio y presencia en listas propias salvo autoría
u otra relación efectiva; restaurar los recupera (P01). La consulta pública,
detalle y lista propios consumen el mismo conjunto efectivo. ADMIN sin relación
propia tampoco obtiene acceso por las rutas propias. Fotos, cantidades, métricas,
geometría, grupo, saldos, asignaciones, Vivero y permisos no cambian.

Overlay, revisión de registro, auditoría y recibo se guardan en una transacción.
La revisión de grupo no cambia. Locks de cuentas en ID ASC preceden a ámbito,
comando, permisos/revisiones y registros/grupo, siguiendo el orden compartido.

## Verificación y límites

Runner aislado, sin `.env`, TCP PostgreSQL ni servicios externos:

```sh
npm run test:db:participantes -- --pg-bin /ruta/postgresql-con-postgis/bin
```

La evidencia de este incremento se guarda separada de084 en
[`pa-int07-participantes-local.json`](evidencia/pa-int07-participantes-local.json).
Registra fuentes, entorno, pruebas SQL/HTTP, carreras con espera de lock observada,
reejecución con datos y rechazo de drift. El clúster temporal se destruye al
terminar. Build, unitarios y generador OpenAPI se verifican además por separado.
