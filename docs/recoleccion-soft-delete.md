# RN-REC-09A — eliminación lógica de borradores

Implementación local del **3 de noviembre de 2026**, base `2a5316d` más árbol de
trabajo. `DELETE /api/recolecciones/:id`, Bearer JWT y sin body: creador o ADMIN
con cuenta interna activa, exclusivamente en `BORRADOR`.
[Contrato frontend y errores](../documentacion/frontend/recolecciones.md#delete-apirecoleccionesid--rn-rec-09a).

La [migración aditiva 089](../migrations/089_recoleccion_eliminar_borrador.sql)
instala RPC privadas SECURITY INVOKER y protecciones de ficha/evidencias.
Cuenta → recolección es el orden de locks; cuenta,
rol, propiedad y estado se comprueban dentro de la transacción. Marca y evento
`BORRADOR_ELIMINADO` se confirman juntos. Una repetición devuelve 404 sin duplicar
el historial. No modifica saldo, código, estado de registro, snapshots, ubicación
ni archivos; no implementa restauración ni reutilización de códigos.

Las consultas operativas y el banco público de semillas excluyen las filas
eliminadas. La comprobación de procesos activos de una planta y el alta de nuevas
evidencias también filtran esas filas al consultarlas. Los códigos se siguen
generando considerando la historia completa, incluyendo eliminados.

## Correcciones de la revisión previa a aplicar 089

- **Creación frente a DELETE:** la compensación usa una RPC que bloquea el padre
  y solo borra una ficha BORRADOR viva, del creador activo y sin historial. Ficha
  y evidencias se compensan en una transacción. Node limpia ubicación y archivos
  propios únicamente tras confirmar `compensado: true`; si DELETE ganó o el
  resultado es incierto, conserva los recursos. Se eliminó la limpieza directa
  de evidencias/ficha desde TypeScript.
- **Fotos frente a DELETE:** un trigger del INSERT de evidencias RECOLECCION
  toma FOR SHARE del padre. Si la eliminación ganó, rechaza el vínculo con
  P0002/404 y el backend intenta retirar solo los archivos nuevos del INSERT
  rechazado. Si las fotos confirmaron antes, DELETE espera y las conserva.
  Cubre PATCH solo fotos, creación y la ruta general de evidencias. El resto de
  tipos de evidencia conserva su comportamiento.
- **Fechas de 015:** preflight exige DATE en `recoleccion.eliminado_en` y
  `recoleccion_historial.created_at`. La eliminación calcula el día en
  `America/La_Paz`, usa RETURNING y devuelve el valor persistido `YYYY-MM-DD`.
  No convierte columnas ni reescribe fechas históricas.

## Verificación local

- Node `24.19.0`, npm `12.0.2`: build aprobado y **81 suites / 1118 pruebas** unitarias
  aprobadas. Incluyen HTTP de DELETE con guard/servicios reales y RPC sustituida,
  actor no falsificable, IDs, errores, Swagger y exclusión pública. Los HTTP
  abrieron sockets locales fuera del sandbox; no usaron servicios externos.
- PostgreSQL `14.17 (Homebrew)` privado desechable: instalación/repetición,
  **37 comprobaciones** de conservación, autorización SQL, ACL, fechas 015 y
  rollback. **Siete carreras** con espera de lock observada: DELETE/submit en
  ambos órdenes, DELETE/DELETE, DELETE/foto en ambos órdenes y DELETE/compensación
  en ambos órdenes. [Evidencia revisada y hash de 089](evidencia/recoleccion-soft-delete-revision-local-2026-11-03.json).
- Runner reproducible: `npm run test:db:recoleccion:soft-delete` (o
  `python3 scripts/qa/recoleccion-soft-delete-test.py --pg-bin /ruta/postgresql/bin`).
  No carga `.env`, deshabilita TCP y elimina exclusivamente su clúster temporal.
  Para guardar otro resultado, `--evidence` exige un archivo nuevo.

El ensayo SQL usa un antecedente mínimo de M1 y las migraciones 014/015 reales; no acredita
replay completo, catálogo remoto, RLS/Storage de Supabase, aplicación en destino,
push ni despliegue. El bloqueo cubre la ficha, los nuevos vínculos de fotos y la
compensación DB de una creación incompleta. Storage sigue fuera de la transacción
SQL: un fallo de red puede dejar archivos pendientes de conciliación; no existe
recuperación durable para ese resultado incierto.

## Publicación y cotejo de destino

1. Cotejar los antecedentes: columnas de soft delete, enum/historial append-only
   de 014, fechas DATE de 015, `usuario.activo`, INSERT/SELECT de historial y USAGE de su secuencia
   para `service_role`. La cuenta privada debe poder leer y bloquear `usuario`
   con FOR SHARE (requiere UPDATE sobre alguna columna, antecedente de gestión
   de cuentas). El preflight de 089 falla si faltan columnas/enum o ese permiso
   de lock; no amplía la escritura sobre cuentas. Evidencias/catálogo requieren
   sus permisos privados preexistentes; 089 concede DELETE de ficha al servicio
   para la compensación restringida, nunca a anon/authenticated.
2. Aplicar **089** en el entorno previsto; no reejecutar indiscriminadamente las
   migraciones anteriores. Cotejar función/trigger y ACL en catálogo: ejecución
   de `fn_recoleccion_eliminar_borrador(bigint,bigint)` y
   `fn_recoleccion_compensar_creacion(bigint,bigint)` solo para servicio, sin
   PUBLIC/anon/authenticated. El cuerpo instalado debe coincidir con el SQL
   versionado. Verificar también el trigger de INSERT en evidencias y las ACL
   efectivas del padre; este ensayo no acredita los grants públicos legados de
   destino. La migración notifica a PostgREST para refrescar el esquema.
3. Publicar este backend consumidor después del SQL. La configuración privada
   debe incluir `SUPABASE_SERVICE_ROLE_KEY`; no hay fallback público.
4. Verificar HTTP con cuentas/fixtures autorizados de ese entorno y luego integrar
   el botón frontend. El contrato de éxito es 200 y el segundo DELETE es 404.

En este corte **no se conectó ni escribió en la base remota**. Los cuatro pasos
anteriores conservan su verificación por entorno.

Actualización del 3 de noviembre de 2026: el usuario reportó haber ejecutado 089
en Supabase. Se registra como aplicación reportada; el cotejo del catálogo/ACL,
la publicación del backend y la verificación HTTP de destino siguen pendientes.
