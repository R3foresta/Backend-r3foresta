# Verificación manual de Supabase: planes 062–063

La revisión local usa PostgreSQL temporal y una API HTTP en localhost con Supabase sustituido. No comprueba la base compartida ni el backend desplegado.

## Diagnóstico de solo lectura

Abrir `documentacion/sql/verificar_subcampania_plan_062_063.sql` y ejecutar su contenido en el SQL Editor de Supabase. Está envuelto en `BEGIN TRANSACTION READ ONLY` y termina con `ROLLBACK`. Si el editor muestra únicamente el último resultado, ejecutar los SELECT numerados por separado y conservar cada resultado. Compartir resultados o errores sin claves ni tokens.

| Consulta | Resultado esperado |
| --- | --- |
| 1 | `plan_revision bigint`, `NOT NULL`, default `0`, constraint validado |
| 2 | `existe_plan_revisado = true` |
| 3 | Las cuatro funciones existen con las firmas indicadas |
| 4 | Escritura: `anon=false`, `authenticated=false`, `service_role=true`. Lectura: lo mismo después de 063 |
| 5 | `execute_publico=false` para ambas después de 063 |
| 6 | Inspección de privilegios/RLS; no representa una auditoría de todas las políticas |
| 7 | Cero planes incoherentes; un BORRADOR sin especies es válido |
| 8 | Cero entregas nuevas fuera del plan; pueden aparecer entregas anteriores a 060 |
| 9 | Cero versiones sin su auditoría; revisión `0` no exige auditoría nueva |
| 10 | Hasta cinco snapshots para comparar con la API |

Las firmas de asignación y plantación ya existían antes de 060/061. Su presencia no demuestra que se hayan aplicado esos reemplazos. Si hay dudas, obtener las definiciones con estas consultas de solo lectura y compararlas con las migraciones del repositorio:

```sql
SELECT pg_get_functiondef(to_regprocedure(
  'public.fn_vivero_asignar_stock_subcampania(bigint,bigint,integer,public.proposito_asignacion,bigint,date,bigint[],text)'
));
SELECT pg_get_functiondef(to_regprocedure(
  'public.fn_m3_registrar_plantacion(bigint,boolean,bigint,date,bigint,numeric,numeric,text,bigint[],jsonb,bigint[])'
));
```

La asignación 060 verifica `subcampania_meta_especie` bajo el bloqueo de subcampaña. La plantación 061 comprueba pertenencia de especie y stock disponible, pero no impone `cantidad_objetivo` como límite al consumo inicial.

## Migración nueva pendiente

`migrations/063_subcampania_plan_lectura_backend.sql` es independiente del diagnóstico: **sí cambia permisos** y debe aplicarse manualmente después de 062. Revoca ejecución directa del snapshot a `PUBLIC`, `anon` y `authenticated`, y la concede al backend `service_role`. No modifica planes, historial ni saldos. La lectura para cualquier rol de usuario sigue disponible a través del backend.

Aplicar 063 antes de desplegar el backend actualizado. Coordinar previamente el frontend: `GET/PUT /api/subcampanias/:id/plan` exigen `Authorization: Bearer <token>` con el JWT que entrega el login WebAuthn. `x-auth-id` pasa a ser opcional en estas dos rutas; si se envía, debe coincidir con `sub` del JWT. Otras rutas conservan su contrato actual. La escritura requiere además ADMIN global, resuelto desde `usuario`, no desde un rol enviado por el cliente.

Confirmar en la configuración del backend que existen `JWT_SECRET` y `SUPABASE_SERVICE_ROLE_KEY`. El secret debe coincidir con el que firma el login. No hace falta compartir sus valores. Las operaciones administrativas ahora rechazan una clave service_role ausente en vez de usar silenciosamente el cliente normal; revisar también los demás consumidores de `getAdminClient()` antes de desplegar.

## Comprobación HTTP sin escrituras

En Postman, usar la URL real del backend y un id existente obtenido en la consulta 10:

1. `GET /api/subcampanias/:id/plan` con el token de un usuario GENERAL: `200` y el mismo snapshot. No requiere pertenecer al equipo.
2. Repetir con otro rol autenticado: `200`.
3. Repetir sin token o solo con `x-auth-id`: `401`.
4. Usar un token expirado o inválido: `401`.
5. Enviar token GENERAL y `x-auth-id` de otra persona: `401`.
6. Consultar un id inexistente con un token válido: `404`.

Un `PGRST202` o mensaje de migración ausente puede indicar que PostgREST todavía no ve la firma. El catálogo SQL no acredita su cache; comprobar la API desplegada. Un error de permisos puede indicar que el backend no usa la clave service_role correcta. Estos diagnósticos no autorizan a reenviar escrituras o reaplicar migraciones automáticamente.

No ejecutar PUT, asignaciones, plantaciones ni devoluciones como prueba en la base compartida: esos escenarios ya se verifican en el cluster aislado.
