# Cotejo del entorno migrado · 14 de noviembre de 2026

Este informe conserva el diagnóstico previo. Los bloqueos se resolvieron en la
[corrección y ensayo posterior](t5-correcciones-pruebas-2026-11-14.md).

Resultado: **verificación parcial; todavía no habilita el ensayo funcional**.
Fuente local `7984368`; destino `vyrjlehkhabydkhjxagx.supabase.co`, PostgreSQL17.6.
Supabase Studio muestra la rama `main / PRODUCTION`; Pablo confirmó después del
cotejo que todo el proyecto es de pruebas y aún no está en producción oficial.
Pablo indicó la cuenta de prueba `user-admi-local`; se observó en Chrome su
perfil autenticado con rol Administrador. No se exportaron credenciales ni JWT.

El cotejo inicial consultó metadatos mediante REST/Storage GET y SQL
`BEGIN READ ONLY`, sin filas operativas ni cuentas. Posteriormente se observó
el perfil ADMIN indicado por Pablo en la PWA. No se aplicaron migraciones,
crearon buckets, subieron archivos o ejecutaron altas de negocio.

| Comprobación | Resultado observado |
|---|---|
| Funciones102/103/105/106 |21/21 firmas presentes, SHA256 de `prosrc` y `SECURITY DEFINER` coinciden con la fuente local. Sin EXECUTE efectivo para `anon`/`authenticated`. El cotejo usa firma completa para distinguir la sobrecarga histórica de despacho. |
| Superficie REST | Tabla `vivero_incorporacion` y12 RPC requeridas presentes. |
| Base viva única y triggers T5 | Índice único válido para EMBOLSADO/INCORPORACION y siete triggers habilitados. |
| Lectura anónima | Cuatro consultas con `limit=0`, sin solicitar filas: `vivero_incorporacion`, `m2_evidencia_contexto`, `lote_vivero`, `evento_lote_vivero` denegadas con401/42501. |
| CHECKs de EMBOLSADO | **Difieren del resultado107**; detalle abajo. |
| Storage | API oficial informa `Bucket not found` para `vivero_incorporaciones`.104 instala políticas; no crea el bucket. |
| API local | Reintento fuera del sandbox: `/health`200 y `/api/docs-json`200, con las tres rutas de incorporación presentes. El intento inicial quedó limitado por acceso local; no acredita el backend publicado. |
| PWA y cuenta elegida | Perfil ADMIN autenticado observado en Chrome. Al abrir `/app/vivero`, queda en «Preparando tu espacio»; después de recargar, página en blanco. No acredita lectura operativa ni alta. |

El diagnóstico posterior `e22344c6-8627-4b16-8e2b-35dee52fdc0d` en Studio confirma
RLS activo en `storage.buckets` y `storage.objects`, presencia de las políticas
restrictivas dedicadas y bucket ausente. La RPC EMBOLSADO coincide con la huella
095 `fd072db314cef4d158e3e19eac9844bb055f47ceafc3ca9eb1963a4ca0c7acb9`,
`SECURITY DEFINER` y configuración esperada. No se verificaron bytes ni URLs
firmadas; la exportación CSV de este segundo diagnóstico no se completó.

## Diferencia que requiere revisión

En destino, `chk_evento_lote_vivero_saldos_eventos_vivos_requeridos` exige
`saldo_vivo_antes IS NULL` para EMBOLSADO y saldo posterior no negativo. Esa
definición no es la original010 ni la resultante107 admitidas por el preflight
local. `chk_evento_lote_vivero_embolsado_consistente` conserva la expresión
antigua con `saldo_vivo_antes = 0`; no contiene los requisitos107 de cantidad
entera positiva y unidad UNIDAD. Ambas restricciones figuran validadas.

Esto no acredita107 por el solo reporte de aplicación. Tampoco basta cambiar
el CHECK para exigir cero:019/095 generan NULL. PostgreSQL acepta un CHECK cuyo
resultado es NULL. La comprobación aislada posterior precisó el alcance:
la expresión antigua sí rechaza cantidad distinta del saldo (`NULL AND FALSE`
es FALSE), pero permite cantidad cero y unidad ausente o distinta de UNIDAD
cuando la cantidad coincide con el saldo.108 cierra esos casos; la primera
interpretación sobre pérdida de igualdad fue corregida tras el ensayo.

Al revisar Studio, el snippet compartido llamado
`107_vivero_embolsado_saldo_naciente.sql` (ID
`8d4daa5c-1dd6-4368-bb3a-5dc6f5f8a991`) muestra el encabezado de106 sobre
reposición/IDs exactos y termina con el ACL de
`pa_d_evidencias_reposicion_exacto`. La interfaz muestra «Success. No rows
returned». El nombre del snippet no acredita que se ejecutó el contenido local
de107; el contenido observado corresponde al alcance106. No se editó ni
reejecutó ese snippet. Esto explica posiblemente la ausencia del resultado107,
pero no establece cuándo se modificó la otra restricción.

Revisar esa diferencia antes de proponer una corrección aditiva.
No se debilitó el preflight ni se modificó el catálogo remoto durante
este cotejo. La definición actual es incompatible con el preflight107 local;
reintentar ese archivo sin revisar la diferencia no constituye una solución.

## Evidencia y siguiente ensayo

- [Catálogo exportado y cotejo por firma](evidencia/t5-entorno-migrado-catalogo-2026-11-14.json).
  Procedencia: SQL Editor de Supabase Studio, consulta
  `764b2b7e-d984-4487-900f-b150a04ef66d`, exportación CSV; transacción de solo lectura.
- [REST, Storage y denegaciones anónimas](evidencia/t5-entorno-migrado-lectura-2026-11-14.json).
- [Seguimiento tras confirmar destino y cuenta de prueba](evidencia/t5-entorno-migrado-seguimiento-2026-11-14.json).
- [Diagnóstico reutilizable de solo lectura](../scripts/qa/t5-entorno-migrado-postflight.sql).
  Su sintaxis y21 firmas se verificaron en PostgreSQL14.24 aislado con PostGIS;
  el runner aprobó124 grupos SQL y11 carreras. Ese resultado es local,
  independiente del catálogo17.6 observado.

Antes del ensayo funcional: resolver el cotejo de107, configurar el bucket privado
según la [guía T5](t5-incorporacion-plantas.md#aplicación-y-corte-pendientes).
El destino y la cuenta ya fueron indicados por Pablo. También debe resolverse
el bloqueo de carga de Vivero observado en la PWA. Luego validar por HTTP alta con foto, recuperación y
reintento, permisos, saldo y continuidad M2/M3. La sesión debe provenir del login
real; no se fabrica un JWT para suplantar una cuenta. Frontend y despliegue
conservan su verificación separada.
