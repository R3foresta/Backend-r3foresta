# T5 · corrección y ensayo del entorno de pruebas

**Resultado aprobado el14 de noviembre de2026** en Supabase
`vyrjlehkhabydkhjxagx` (PostgreSQL17.6), backend local `localhost:3000` y
PWA local `localhost:5173`. Pablo confirmó que este proyecto es de pruebas,
aunque Studio etiqueta la rama como PRODUCTION.

Se aplicó la migración aditiva [108](../migrations/108_vivero_embolsado_cierre_catalogo.sql)
del commit `db95e70`; el cotejo posterior muestra las dos restricciones validadas.
Corrige la variante detectada sin modificar107 ni reescribir hechos, funciones
o permisos. [Aplicación observada](evidencia/t5-108-aplicacion-pruebas-2026-11-14.json)
y [justificación/pruebas](t5-108-cierre-catalogo.md). No reaplicar107 después de108.

Se creó por la API oficial el bucket `vivero_incorporaciones`: privado,
15728640 bytes, MIME JPEG/PNG/WebP/HEIC/HEIF. Las políticas dedicadas104 ya
estaban presentes. [Configuración verificada](evidencia/t5-bucket-configurado-2026-11-14.json).

Vivero recuperó su carga sin cambios de código ni reinicio de servidores por
esta tarea. Se observó listado y recarga completos en Chrome con la sesión ADMIN
indicada por Pablo. La causa del bloqueo transitorio anterior no está determinada;
no se atribuye a SQL, API o caché sin evidencia.
[Comprobación de carga y runtime](evidencia/t5-pwa-carga-2026-11-14.json).

## Ensayo con foto y sesión real

[17 comprobaciones HTTP/Storage aprobadas](evidencia/t5-http-storage-real-2026-11-14.json)
mediante la [herramienta temporal QA](../scripts/qa/t5-entorno-http.md), usando
la sesión legítima de la PWA en memoria. No se fabricó ni exportó el JWT.

- Carga multipart de un PNG sintético rotulado QA; lectura firmada con SHA256
  idéntico y acceso público sin firma denegado.
- Alta SALDO_INICIAL/DONACION de3 unidades, recuperación y replay con el mismo
  lote/evento; conflicto409 al reutilizar la clave con otra cantidad.
- Saldo físico3, asignado0 y un único evento con foto vinculada; sin origen
  Recolección ficticio. La foto deja de estar pendiente y la ruta genérica
  responde404 para esa evidencia privada. Sin Bearer, las rutas probadas dan401.

Se conserva el fixture: lote`124`, evento`338`, evidencia`779`, vivero`1`,
planta`46`, solicitud`41e54f26-f8a2-422b-8ef8-b029aedf1edc`.
No representa recepción ni conteo físico real. No se borraron hechos u objetos
para limpiar la prueba. Se retiró la copia temporal QA de `public/`; la PWA
permanece sin cambios en `0007ee0`.

Después del alta también se verificó que Vivero carga el listado con los tres
lotes, incluido`124`. La tarjeta existente todavía interpreta su base viva como
«Embolsado», muestra «Supervivencia100%» y «Disponible para entregar». Esas
etiquetas no acreditan producción, supervivencia ni aptitud de un SALDO_INICIAL;
son un pendiente concreto de adaptación del frontend T5. El alta aprobada por
API no cierra esa interfaz ni su aceptación de producto.

## Verificación y puntos de retorno

| Ámbito | Resultado |
|---|---|
| Backend | Build y95 suites/1386 unitarios aprobados. |
|108 aislada |37 grupos focales aprobados; preservación, repetición, deriva y rollback. |
| Regresión T5 aislada con108 |126 grupos SQL,11 carreras y8 HTTP aprobados, PostgreSQL14.24/PostGIS real; Storage sintético. |
| PWA existente, Node24.19 | Build y92/92 pruebas de Vivero aprobadas; sin parche frontend. Node24.5 provocaba un fallo de fecha/NBSP que no se reproduce con el runtime recomendado. |

Commits de esta intervención: `3f454bb` conserva el diagnóstico previo,
`ad379b7` registra el bucket, `c5a82de` guarda el ensayo revisado y
`db95e70` contiene108 y su regresión. Los commits permiten recuperar archivos;
**revertir Git no revierte Supabase ni elimina los hechos del ensayo**. Una
reversión remota necesita su propio cambio revisado; no restaurar restricciones
incompatibles sobre nuevos hechos.

Este resultado cubre el alta ADMIN con foto en el entorno indicado. No acredita
otros roles, concurrencia remota, recorrido M3 remoto, WebAuthn de alta,
despliegue externo ni la interfaz T5 de producto. El siguiente incremento es
preparar y revisar el plan del frontend T5 antes de implementarlo.
