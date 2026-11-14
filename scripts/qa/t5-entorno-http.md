# Ensayo HTTP T5 en el entorno de pruebas confirmado

`t5-entorno-http.html` es una herramienta temporal de QA; no implementa el
frontend T5 de producto ni crea rutas de backend. Debe copiarse temporalmente al
`public/` de la PWA y abrirse como `http://localhost:5173/t5-entorno-http.html`.
La API se limita a `http://localhost:3000`; Storage se verifica exclusivamente
en `vyrjlehkhabydkhjxagx.supabase.co`. No cambiar estos destinos sin revisar el
ensayo y confirmar el entorno.

Requisitos: backend local actual arrancado y conectado al destino confirmado de
pruebas, corrección aditiva de CHECKs aplicada y cotejada, bucket privado
`vivero_incorporaciones` configurado con104, usuario autenticado mediante el
login normal de la PWA con rol ADMIN. La sesión existente se usa en memoria;
no se fabrica, copia a archivos, imprime o exporta el JWT.

1. Abrir la herramienta y cargar sesión/catálogos. El perfil se valida con
   `/api/users/profile`, sin mostrarlo o incluirlo en el informe.
2. Elegir explícitamente vivero y especie activos. Preparar y revisar intención:
   SALDO_INICIAL / DONACION,3 unidades, fecha del día en America/La_Paz. La clave
   UUID y payload se conservan en localStorage antes de subir.
3. Confirmar el alta de prueba y ejecutar. Genera un PNG sintético rotulado QA;
   prueba multipart, recuperación de pendientes, SHA256 de los bytes originales,
   lectura firmada y denegación por ruta pública sin firma.
4. Confirma una incorporación, recupera recibo, repite exactamente la intención,
   comprueba conflicto409 al cambiar cantidad, saldo3/asignado0 y timeline de un
   único evento con su foto vinculada. Comprueba que ya no está pendiente y que
   la consulta genérica de evidencias responde404 para esa foto privada.
5. Descargar el informe JSON sin credenciales, perfil o enlaces firmados. Retirar
   la copia temporal del `public/` después de observar el resultado. Conservar la
   fuente de QA en el backend, la evidencia y los hechos remotos.

Ante timeout/503, conservar solicitud, intención y referencias. La siguiente
ejecución consulta recuperación y fotos pendientes antes de volver a confirmar;
no genera otra clave ni limpia hechos/objetos. El botón reintenta sólo por acción
explícita. Si el estado local ya conserva una foto pero el contexto no aparece,
se detiene sin resubir automáticamente.

Limitaciones: este fixture no representa plantas o conteos reales, no acredita
otros roles, concurrencia remota, WebAuthn de alta, M3 ni la UI de producto. El
ensayo conserva un lote de3 plantas y el historial auditable con referencia QA.
No usar las suites e2e históricas con limpieza de filas contra esta base.
