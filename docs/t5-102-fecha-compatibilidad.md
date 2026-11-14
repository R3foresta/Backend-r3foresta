#102 · compatibilidad del helper de fechas aportado

El14 de noviembre de2026 Pablo reportó que102 rechazaba
`public.fn_vivero_assert_fecha_operativa(date,date)` en su preflight. El
diagnóstico de catálogo aportado muestra los otros seis helpers coincidentes,
esta función presente, `SECURITY INVOKER`, configuraciónNULL y cuerpo con hash
`b0195755dbff0ec1d6da9518324884e654209936237dc9a0ce45c27b47c105a1`.
El resultado no identifica proyecto/versión de PostgreSQL; no se hizo una
conexión ni un cotejo directo al destino desde esta tarea.

La derivación local desde010 confirma que ese cuerpo es **exactamente el
original sin las cinco líneas del bloque TODO**, sin modificar ninguna
sentencia. Conserva fecha obligatoria, prohibición de futuro, ventana inclusiva
de10días y fecha mínima habilitante.

La [102 actualizada](../migrations/102_vivero_incorporacion.sql) acepta dos
huellas exactas para ese helper:

| Cuerpo revisado | SHA256 de `prosrc` |
|---|---|
|010 original con comentarios|`e62b14d2c5d963a0d9c49be78a766d1077e6b1219061da0449c99d825c3e7273`|
|Definición aportada sin el bloque TODO|`b0195755dbff0ec1d6da9518324884e654209936237dc9a0ce45c27b47c105a1`|

No se normalizan cuerpos desconocidos ni se omite el control. Los otros seis
helpers siguen con una sola huella, y se mantiene el requisito de seguridad de
cada función. Los diagnósticos102 y107 comparten las mismas variantes admitidas.
El helper, SQL001–100, reglas de fechas y permisos no se modifican.

102 falló antes del DDL de dominio en el intento reportado: se corrige el
preflight de esa migración todavía no confirmada. No hace falta reinstalar010,
añadir un parche previo en destino ni ejecutar resets. Después de revisar la
entrega, Pablo puede volver a ejecutar **102 completa desde el archivo local
actualizado** y conservar el orden posterior103–107. Una101 ya confirmada no
requiere reaplicación. El éxito en destino queda pendiente de su resultado.

La evidencia nueva de compatibilidad se conserva por separado de los cortes
anteriores; sus hashes históricos no se actualizan para atribuirles este ajuste.
Resultado: build y95suites/1386unitarios aprobados; **124 grupos SQL,
11carreras y8HTTP** aprobados en PostgreSQL14.24/PostGIS3.2.10 con Node24.19.0.
[Evidencia nueva](evidencia/t5-102-fecha-compatibilidad-2026-11-14.json), con
huellas de fuentes coincidentes y clúster detenido/eliminado, sin TCP ni `.env`.
Las pruebas locales contrastan instalación inicial y repetición con hechos,
las dos variantes conocidas, bordes de fechas y rechazo transaccional de
no-op, ventana distinta, SECURITY DEFINER o función ausente. No se aplicó
SQL remoto ni se modificó Storage, PWA, commit, push o despliegue.
