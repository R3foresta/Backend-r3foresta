# INT07 · Motor y corrección de observaciones

Entrega local del 21 de octubre de 2026 sobre `fbf2529` más árbol. Amplía el
motor común con `CORREGIR_OBSERVACIONES_PLANTACION`; no crea un registro nuevo
para sustituir el original. Implementación y verificación locales completas para
este caso; INT07 conserva los demás casos pendientes.

**Actualización del 22 de octubre:** Pablo informa ejecución de084 con `Success`.
[Registro y límites](evidencia/pa-int07-084-aplicacion-reportada-2026-10-22.json).
El [cotejo aportado](evidencia/pa-int07-084-cotejo-2026-10-22.json) confirma cinco
funciones con metadata/ACL, dos CHECK y una secuencia coincidentes; sin faltantes
ni overloads adicionales. Comandos, correcciones y efectivo coinciden completos.
El registro legado conserva GPS NOT NULL y saldo generado declarados en030;
el fixture simplifica esas propiedades. Se documentan las diferencias, sin
certificar la fórmula del generado ni igualdad universal del esquema legado.
No se necesita repetir SQL para este cotejo. Publicación del backend compatible
y HTTP remoto siguen pendientes. En el corte de ese cotejo, los nuevos controller/service
estaban sin commit; el versionado posterior se registra en el estado canónico.
El JSON no identifica por sí solo el proyecto ni
amplía los resultados locales del21.

## Contrato consumible

Todas las rutas requieren Bearer JWT verificado, cuenta activa y cliente privado
del backend. Respuestas `Cache-Control: private, no-store`, `Vary: Authorization`.

| Método y ruta bajo `/api/v1` | Comportamiento |
|---|---|
| `GET /plantaciones/:id/contexto-correccion` | Original y efectivo de observaciones, ámbito, estado, revisiones y capacidad de corregir. ADMIN global o administrador contextual vigente; este último recibe textos null y capacidad false. |
| `GET /plantaciones/:id/historial-correcciones` | Historia autorizada, ID DESC; `limite` 1–50, por defecto 20, y `cursor` firmado opcional. Revalida autoridad en cada página. Para administrador contextual, observaciones y motivo null. |
| `POST /plantaciones/:id/correcciones/observaciones` | Solo ADMIN global, subcampaña ACTIVA, objeto vigente y revisión coincidente. |
| `GET /participacion/comandos/:comando_id?operacion=CORREGIR_OBSERVACIONES_PLANTACION` | Recupera el recibo del actor original aunque posteriormente pierda autoridad; su cuenta debe seguir activa. |

Entrada POST cerrada; todos los campos son obligatorios:

```json
{
  "comando_id": "1a370000-0000-4000-8000-000000000001",
  "revision_esperada": "0",
  "motivo": "Corrección de transcripción",
  "observaciones": "Observación corregida"
}
```

ID de ruta y revisión son BIGINT en cadenas canónicas. Motivo NFC/trim de 3–1000
caracteres. Texto Unicode válido representable en PostgreSQL; NUL y surrogates
aislados se rechazan con422 antes de la RPC. Observaciones admite null o texto NFC/trim hasta 2000 caracteres;
vacío equivale a null. No se reciben actor, rol, ámbito, RPC ni asignaciones.
El ID de la ruta integra los bytes de la intención `PA-COMANDO/1`; los bytes de
operaciones anteriores se conservan.

El resultado `CORRECCION_PLANTACION` contiene el ID de corrección (null si
`SIN_CAMBIOS`), objeto/ámbito, caso, revisiones anterior/nueva de registro y
grupo, cambio, estado lógico y referencia vigente null. El recibo no contiene
observaciones ni motivo. `SIN_CAMBIOS` valida autoridad, ACTIVA y revisión;
no incrementa versiones ni crea historial. El detalle propio del autor devuelve
las observaciones efectivas; el participante conserva textos null. El original
y el recibo inicial permanecen conservados.

Replay terminal propio precede a nueva autorización. Reutilizar clave con otro
contenido produce `COMANDO_REUTILIZADO` sin reemplazar el terminal. Rechazos de
negocio son durables; errores inesperados, locks o commit incierto conservan
503 inconcluso con `MISMA_CLAVE`. GET terminal devuelve 200; 404
`COMANDO_NO_CONFIRMADO` conserva la intención para recuperación.

## SQL y límites de entrega

La migración aditiva 084 amplía catálogos/recuperación y añade el ejecutor y
lecturas privadas. La escritura conserva overlay, revisión, auditoría y terminal
en una transacción. Observaciones no modifica grupo, consumo, asignaciones,
entregas, devoluciones ni Vivero. El orden de locks se comparte con los escritores
existentes; las pruebas comprueban ambos órdenes de carrera.

## Verificación y reproducción

| Comprobación | Resultado local |
|---|---|
| `npm run build` | Aprobado |
| `npm run test:unit -- --runInBand` | 67 suites / 868 pruebas aprobadas, incluidas las HTTP con sockets locales |
| Generador OpenAPI `--check` | 33 rutas / 71 schemas reproducibles; rutas anteriores conservadas salvo la ampliación de recuperación |
| Runner INT07 | 18 grupos SQL, ocho carreras con espera `Lock` observada y diez pruebas HTTP con RPC reales |
| Reejecución084 y drift | Conserva datos/terminales/historia; cuatro alteraciones sintéticas rechazadas con rollback íntegro |
| Cotejo084 READ ONLY | Cinco funciones, dos CHECK, cuatro tablas y una secuencia; firmas/cuerpos esperados y sin faltantes |

[Evidencia del ensayo](evidencia/pa-int07-motor-local.json): Node24.19.0,
PostgreSQL17.11 (Postgres.app), PostGIS3.5.6, antecedentes mínimos B/C/A/D/INT05
y082/084. No carga `.env`, no abre TCP para PostgreSQL ni conecta a servicios
externos. HTTP usa sockets locales y transporte hacia esa DB privada. El clúster
y su directorio temporal se eliminan al terminar. Se conservan las evidencias
anteriores D/INT05 y082.

[Verificación antes del commit del22](evidencia/pa-int07-084-precommit-2026-10-22.json):
build, OpenAPI y71 suites/950 unitarios aprobados sobre `8957bcc` más este árbol.
Incluye los cambios de imágenes y otros módulos ya versionados después del ensayo
original; aquel corte SQL conserva sus fechas y huellas, sin reescribir evidencia.

```sh
npm run test:db:correcciones -- --pg-bin /ruta/postgresql-con-postgis/bin
```

El runner necesita permisos locales para memoria compartida de PostgreSQL y
sockets HTTP. La verificación inicial dentro del sandbox no pudo iniciarlos;
el ensayo autorizado completó todas las comprobaciones anteriores. Los datos son
sintéticos: no acredita replay completo001–067 ni operación en otro destino.

[Consulta de cotejo084](../scripts/sql/pa-int07-cotejo-084.sql) y
[baseline local](evidencia/pa-int07-084-catalogo-pg17-local.json): solo catálogo,
sin filas de negocio ni ejecución de RPC. Antes de aplicar la
[migración084](../migrations/084_pa_int07_motor_observaciones.sql), comprobar
numeración y precondiciones del destino identificado. Las huellas de los cuerpos
anteriores072/081 o del propio084 se validan; drift produce rollback, sin reparación
implícita. La consulta posterior debe cotejarse con el baseline local, separando
versión del servidor y propietario cuando proceda.

## Pendientes conservados

No habilita participantes, cantidades, reversiones ni alta de mortandad. BE02 y
BE03 conservan sus partes pendientes; BE04–BE08 y frontend no se cierran por este
caso. La ejecución084 tiene Success reportado y catálogo aportado cotejado el22
en el alcance declarado. Push, despliegue y HTTP remoto conservan sus comprobaciones pendientes.
No volver a ejecutar 082/083 para habilitar este motor.

Fuentes: [contrato de INT07](pa-int07-contrato.md),
[ficha canónica](../../r3foresta-docs/specs/plantacion/participacion-aliada/implementacion/pa-t-int07.md),
[OpenAPI generado](pa-int02c-openapi.json).
