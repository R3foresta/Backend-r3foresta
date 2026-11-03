# Rechazo de recolecciones pendientes sin límite de fecha

Corrección MVP local del 3 de noviembre de 2026, sobre `2745885`. El CHECK legado
`chk_fecha_rango` comprueba la ventana de 45 días en todo UPDATE: una pendiente
que envejeció quedaba bloqueada incluso al rechazarla.

La migración [090](../migrations/090_recoleccion_rechazo_sin_limite_fecha.sql)
conserva la expresión original para los demás estados y añade una excepción
`RECHAZADO` con `COALESCE`, evitando que un estado nulo admita fechas inválidas.
Un trigger AFTER limita esa excepción a `PENDIENTE_VALIDACION → RECHAZADO` sin
cambiar fecha, saldo, snapshots ni otros campos ajenos al rechazo. Tampoco admite
altas antiguas en `RECHAZADO` ni ediciones/reintentos de rechazados fuera de rango.
La aprobación sigue sujeta a 45 días/no futuro; captura, edición y reenvío no se amplían.

El CHECK queda **NOT VALID** de forma intencional: omite el barrido inicial de
filas históricas, sin omitir la comprobación de los siguientes INSERT/UPDATE.
La instalación no cambia datos ni intenta validar todo el legado con CURRENT_DATE.
El preflight exige el CHECK conocido o la repetición exacta de 090 y falla ante
otra expresión. Compara `pg_get_expr` completo con dos CHECK de referencia que
el mismo servidor analiza en una tabla temporal vacía con los tipos reales de
fecha/estado. Conserva agrupación y valor exacto de los literales; no usa lower
ni elimina paréntesis. La tabla se crea en `pg_temp`, se elimina dentro del
preflight y nunca lee/modifica filas públicas. Instalar requiere permiso TEMP
en la base de datos; si el nombre temporal ya existe, falla sin eliminarlo.
No reemplaza automáticamente reglas distintas del destino.

`fn_recoleccion_rechazar_validacion` es privada para `service_role`, SECURITY
INVOKER. El backend usa `getAdminClient()` y obtiene el actor de la identidad
verificada por `InternalActorGuard`; la RPC revalida cuenta activa y rol
`VALIDADOR`/`ADMIN`, bloquea cuenta → recolección, comprueba pendiente/vigente y
confirma estado, motivo e historial juntos. La atomicidad es necesaria aquí:
la compensación anterior no podría devolver una ficha antigua a PENDIENTE porque
su fecha seguiría incumpliendo el CHECK. No se modifican los demás casos de uso.

Instalar y cotejar **090 antes de publicar el backend consumidor**. Requiere
014/015/058, `usuario.activo`, privilegios privados de cuenta y el CHECK legado
confirmado. En destino comprobar definición del CHECK, `convalidated=false`,
trigger acotador habilitado, RPC/ACL, antecedente append-only y triggers existentes:
si otro trigger modifica campos ajenos al rechazo, la excepción falla cerrada y
debe revisarse ese catálogo. No ampliar la lista de campos para eludirlo.

El catálogo aportado por el usuario en la revisión del 3 de noviembre muestra
tres triggers de recolección habilitados (`O`), compatibles con el rechazo:

- `trg_recoleccion_init_saldo_operativo`: BEFORE INSERT; no se ejecuta al rechazar.
- `trg_recoleccion_proteger_eliminado`: BEFORE UPDATE correspondiente a 089;
  comprueba vigencia/soft delete y devuelve NEW sin modificarlo.
- `trg_recoleccion_sync_on_base_change`: AFTER UPDATE OF cantidad_inicial con
  OLD IS DISTINCT FROM NEW; el rechazo no actualiza esa columna.

No aparecen otros triggers ni uno de `updated_at` en ese catálogo aportado.
Esto acredita compatibilidad de las definiciones compartidas, sin constituir
una consulta remota propia ni aplicación de 090. Esta consulta de solo lectura
permite revisar las definiciones y sus funciones antes de instalar:

```sql
SELECT t.tgname, t.tgenabled, pg_get_triggerdef(t.oid, true) AS trigger_def,
       pg_get_functiondef(t.tgfoid) AS function_def
FROM pg_trigger t
WHERE t.tgrelid = 'public.recoleccion'::regclass AND NOT t.tgisinternal
ORDER BY t.tgname;
```

Verificación local con Node 24.19.0/npm 12.0.2: `npm run build`;
`npm run test:unit -- --runInBand`:
82 suites y 1133 pruebas aprobadas. El primer intento bajo sandbox no pudo abrir
sockets HTTP; la repetición con acceso local aprobado completó toda la suite.
`npm run test:db:recoleccion:rechazo` comprobó inicialmente 13 grupos en PostgreSQL 14.17
Homebrew privado desechable, sin TCP, `.env` ni servicios externos. El runner
admite `--pg-bin` y `--evidence` para una evidencia nueva.
[Evidencia histórica previa a revisión](evidencia/recoleccion-rechazo-fecha-local-2026-11-03.json).

La revisión independiente previa a instalar detectó que eliminar paréntesis en
el preflight confundía `(a AND b) OR c` con `a AND (b OR c)`. La comparación
canónica completa corrige ese defecto. La nueva ejecución SQL aprobó **15 grupos**,
incluidos el adversario de agrupación y el literal distinto `'rechazado'`:
ambos abortan conservando CHECK (incluido su OID), triggers y funciones sin
objetos temporales residuales. La instalación original y la repetición de 090
siguen aprobadas. [Evidencia de revisión y hash de la migración corregida](evidencia/recoleccion-rechazo-fecha-revision-local-2026-11-03.json).
No se repitieron build/unitarios por este ajuste exclusivo de SQL, runner y documentación.

Se verificaron fechas antigua, actual, futura y límite de 45 días; autorización,
motivo e historial; denegaciones de altas, estado nulo, edición de fecha/saldo/
snapshot y reenvío; rollback real ante fallo del historial; dos rechazos
concurrentes con lock observado, un ganador y un único evento. El antecedente
mínimo M1 + 014/015/058 no acredita replay completo ni Supabase/Storage/HTTP remoto.
La aprobación conserva su implementación legada con llamadas separadas: esta
corrección no acredita ni resuelve sus carreras o compensaciones generales.

El 3 de noviembre de 2026 el usuario reportó haber ejecutado 090 en Supabase.
La aplicación queda reportada por el usuario; el cotejo posterior del catálogo y
la prueba HTTP en destino siguen pendientes. Los ensayos anteriores fueron locales,
sin modificación de datos remotos por el agente. Push y despliegue no acreditados.
Código local, prueba aislada y SQL aplicado son hechos separados.
