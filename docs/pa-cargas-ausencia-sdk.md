# Cargas: reconocimiento de ausencia en Storage

Verificación del 26 de octubre de 2026, base `e76ff83` más árbol local con
cambios previos independientes de INT07. Node v24.19.0; Storage SDK 2.89.0.

Una descarga de una ruta aleatoria inexistente en `participacion_evidencias`,
con la configuración privada local, reprodujo `StorageUnknownError` con
`originalError` Response HTTP400 y cuerpo `statusCode: "404"`, `code: "NoSuchKey"`.
El detector anterior devuelve false: `asegurarObjeto` aborta antes de upload y
el servicio conserva `202 RESERVADA`. La consulta fue de lectura, sin crear
objetos ni modificar datos. El backend local en puerto3000 respondió a health.
Esto confirma el mecanismo con Storage real, no una petición autenticada del
intento concreto de subcampaña51 ni la versión cargada en el proceso.

`ausente` ahora lee JSON de un clon del Response de forma asíncrona; exige
señales de ausencia y rechaza estados/códigos contradictorios, permisos,
servicio o cuerpos ilegibles. Upload y limpieza esperan esa comprobación.
Se conservan subida sin sobrescritura y verificación de hashes antes de finalizar.
No cambia DTO, Swagger, SQL, locks ni la identidad de recuperación.

Verificación:

- Build aprobado; 72 suites y 999 unitarios aprobados. La ejecución inicial
  restringida falló por sockets EPERM; la repetición con sockets locales pasó.
- 27 pruebas focales: SDK real con fetch simulado, foto nueva disponible con
  evidencia, recuperación de reserva con mismo comando/carga/bytes, 404 simple,
  permisos/servicio/cuerpos inválidos, hash distinto y limpieza asíncrona.
- OpenAPI `--check` aprobado: 39 rutas y 84 schemas.

Pendiente: PUT autenticado nuevo y recuperación del intento real de51 con sus
IDs y archivo original; confirmar URL y versión del backend que consume la PWA.
Las pruebas unitarias sustituyen RPC/objetos; no acreditan esas escrituras en
el entorno real. Sin push ni despliegue efectuados como parte de esta corrección.

## Comprobación del intento indicado

El mismo día se consultaron las dos cargas indicadas por el usuario en
subcampaña51: ambas seguían RESERVADA con evidencia nula; original y derivada
de sus generaciones actuales devolvían HTTP400/404/NoSuchKey. Sin escrituras
directas en DB ni Storage.

El proceso local había arrancado antes del build corregido, mediante
`nest start run dev`, sin watch. Se reinició con `node --enable-source-maps dist/main`;
health respondió correctamente a las15:03:30 UTC con siete segundos de uptime.
La corrección está cargada en el nuevo proceso local. Pendiente el reintento
autenticado desde la PWA con los mismos IDs y archivos originales; no se dispone
de esos bytes en esta sesión. Esto no acredita despliegue remoto.
