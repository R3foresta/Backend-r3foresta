# Cierre de superficie 083 · recuperación de desarrollo

El diagnóstico aportado el 20 de octubre de 2026 para desarrollo
`vyrjlehkhabydkhjxagx` muestra 62 permisos incompatibles con el preflight de 080,
concedidos directamente a `anon` y `authenticated` por `postgres`, sin membresías
relevantes ni ACL por columna. Además aparecen grants `MAINTAIN`, incorporados
por PostgreSQL 17 y omitidos por el vector de comprobaciones anterior.
[Referencia de privilegios PostgreSQL 17](https://www.postgresql.org/docs/17/ddl-priv.html).

080 exige además una precondición incorrecta para este destino:
`public.comunidad`. El modelo real representa las comunidades en
`division_administrativa`, con tipos por país y nivel. Los consumidores y las
FK existentes usan esa tabla; el fixture histórico de INT02-D había creado una
tabla `comunidad` artificial y no detectó la diferencia del destino.

La reparación aditiva es
[083](../migrations/083_pa_superficie_privada_compat.sql). Conserva 080 como
fuente histórica y no crea tablas o vistas para satisfacer su precondición.

| Superficie explícita | Política de 083 |
|---|---|
| Diez tablas operativas de 080, `subcampania_meta_especie` y la vista de saldos si existe | Retirar privilegios de tabla y columna de PUBLIC/anon/authenticated. |
| `campania`, `campania_organizacion`, `campania_estado`, `planta`, `division_administrativa` | Conservar SELECT existente y retirar los demás privilegios, incluido MAINTAIN cuando esté disponible. |
| `tipo_planta` y `comunidad` si existen | Misma política de catálogo de solo lectura, sin convertir su ausencia en un error ni conceder lecturas nuevas. |
| `v_ubicacion_enriquecida` si existe y coincide con la definición territorial cotejada | Conservar SELECT existente y retirar los demás privilegios. Una definición, firma, bases, opciones, reglas o triggers distintos detienen la transacción para revisión. |

Se conservan filas, secuencias, propietarios, funciones, RLS, membresías y
ACL directas de otros beneficiarios. El servicio mantiene sus permisos; los
grants heredados incompatibles o la falta de permisos requeridos abortan la
transacción sin modificar roles ni ampliar accesos. Las vistas y definers
externos al inventario explícito siguen sujetos a revisión, igual que en 080.

## Orden para este destino

074/075/078 están recuperadas; las definiciones de 077/079 se cotejaron. Después
de publicar y comprobar el ajuste de escrituras privadas de campañas en ambos
consumidores —local y Render de desarrollo—, aplicar 083 en lugar de intentar
080 original. Luego continuar con 081 y 082, cotejando cada resultado. Esta
dependencia explica que 083 preceda a 081/082 durante esta recuperación manual;
la numeración no acredita qué SQL está instalado.

El ajuste de campañas conserva ADMIN y las reglas existentes. Build y 66
suites/827 unitarios se aprobaron localmente. Pablo autorizó commit y push a
`main` el 20 de octubre de 2026; el push dispara el despliegue de desarrollo en
Render según su configuración declarada. Publicación Git, disponibilidad de la
versión en Render y aplicación SQL requieren comprobaciones separadas.

No usar la 080 original como verificador posterior de 083: su exigencia de
`comunidad` sigue intacta. Los errores, huellas y resultados de cada entorno se
registran en evidencias propias, sin reescribir las entregas anteriores.

## Verificación local y siguiente paso

La revisión vigente aprobó 36 comprobaciones en
[PostgreSQL 14.17](evidencia/pa-superficie-083-ubicacion-pg14-local.json) y 37 en
[PostgreSQL 17.11](evidencia/pa-superficie-083-ubicacion-pg17-local.json), incluido
MAINTAIN. Ambos ensayan 083 después de 080 previamente aplicada,
catálogos con/sin `comunidad`, conservación de SELECT por columna y servicio,
reaplicación y rollback ante permisos heredados, vistas/definers ajenos o
servicio insuficiente. La ampliación territorial reproduce la huella real de la
vista, comprueba una lectura anónima antes/después del cierre, retira DML por
columna y rechaza una definición o trigger de escritura añadidos.
Son clústeres sintéticos sin TCP/.env; el destino aportado usa 17.6 y todavía
requiere ensayo propio. Los informes anteriores de
[27](evidencia/pa-superficie-083-pg14-local.json) y
[28](evidencia/pa-superficie-083-pg17-local.json) comprobaciones conservan las
huellas del corte previo, cuyo fixture no incluía la vista territorial.

```sh
python3 scripts/qa/pa-superficie-compat-test.py --pg-bin /ruta/postgresql/bin
```

El ensayo anterior `/private/tmp/pa-083-diagnostico-rollback.sql` se detuvo antes
de los REVOKE con
`PA_D_VISTA_PUBLICA_NO_AUTORIZADA: public.v_ubicacion_enriquecida anon`.
El ADR002 y el lector común documentan SELECT público legítimo de esa vista
territorial.
[Error, fuentes y límites](evidencia/pa-superficie-083-ensayo-rechazado-2026-10-20.json).

El [diagnóstico específico de 083](../scripts/sql/pa-superficie-083-diagnostico.sql)
v1 corresponde al manifiesto anterior a la inclusión territorial. Separa las
revocaciones previstas de los bloqueos y muestra definición, columnas,
dependencias, reglas y triggers reales de `v_ubicacion_enriquecida` mediante
READ ONLY. Aprobó 43 comprobaciones en
[PostgreSQL 14](evidencia/pa-superficie-083-diagnostico-pg14-local.json) y 43 en
[PostgreSQL 17](evidencia/pa-superficie-083-diagnostico-pg17-local-r3.json),
incluido rechazo real de escrituras con SQLSTATE 25006 y conservación de la
lectura de ubicación.

El resultado aportado por Pablo confirma seis bloqueos: INSERT/UPDATE/DELETE
de `anon` y `authenticated` sobre esa vista. Su definición coincide con ADR002;
proyecta las 13 columnas esperadas desde las cuatro tablas territoriales, sin
ancestro privado, reglas adicionales ni triggers. No aparecen otros bloqueos,
membresías relevantes o requisitos de servicio insatisfechos. La revisión
candidata de 083 incluye por ello la vista como solo lectura, comprobando su
huella, firma y bases antes de retirar permisos adicionales. La
[evidencia del cotejo](evidencia/pa-superficie-083-ubicacion-cotejada-2026-10-20.json)
registra la entrada, las fuentes y las pruebas de esta revisión; las evidencias
anteriores se conservan como cortes históricos.

Pablo confirmó que el nuevo ensayo `/private/tmp/pa-083-ubicacion-rollback.sql`
terminó sin errores, e identificó expresamente ese archivo. Se registra como
[éxito reportado por el usuario](evidencia/pa-superficie-083-ensayo-aprobado-2026-10-20.json),
sin consulta remota independiente. Su cuerpo conserva esta revisión de 083 con
el COMMIT final sustituido por ROLLBACK: ejecuta revocaciones transaccionales
que se revierten; no instala 083 ni cierra grants permanentemente. El archivo
del ensayo anterior permanece intacto.

Antes del COMMIT definitivo se debe comprobar el backend actualizado en ambos
consumidores. El ensayo no acredita aplicación de 083 ni disponibilidad de la
versión en Render. Al autorizar la publicación, la rama local `main` tenía
además tres commits anteriores pendientes (INT02-D e INT05); el push autorizado
incluye esos cambios. No ejecutar 083 definitiva basándose solo en la
confirmación de un push.

## Cotejo posterior · 21 de octubre de 2026

Pablo confirmó ambos consumidores actualizados en `fbf2529` y la ejecución con
Success de 083 definitiva, 081 y 082. El diagnóstico aportado después muestra
cero bloqueos, riesgos de herencia o revocaciones previstas en su inventario.
La vista territorial conserva su definición y SELECT; anon/authenticated
mantienen solo SELECT y la ACL de servicio permanece intacta frente al cotejo
previo. Las cinco funciones081 y la estructura/helpers/ACL enumeradas de082
coinciden con sus fuentes. El complemento082 confirmó 28 comprobaciones MAINTAIN
sin permisos inesperados y los límites exactos de las tres secuencias.
[Cotejo completo y límites](evidencia/pa-int07-cotejo-desarrollo-completo-2026-10-21.json).

Esto registra aplicación reportada por el usuario y catálogo observado, sin
ejecución SQL remota del agente ni prueba HTTP, de saldos o de correcciones.
