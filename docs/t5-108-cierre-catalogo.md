# Cierre aditivo de EMBOLSADO108

[108](../migrations/108_vivero_embolsado_cierre_catalogo.sql) resuelve la
variante exacta de CHECK observada en el [cotejo del entorno de pruebas del14](t5-entorno-migrado-2026-11-14.md).
No modifica107 ni reescribe eventos, lotes, saldos, IDs, funciones o permisos.

Acepta únicamente las definiciones validadas de010,107, la variante observada y
su propio resultado108. Comprueba además cuerpo SHA256, firma, configuración y
seguridad de la RPC EMBOLSADO095. La operación toma un lock exclusivo de tabla
con espera máxima5s y se confirma en una sola transacción.

El resultado conserva las reglas107 para EMBOLSADO: cantidad entera positiva en
UNIDAD, saldo posterior igual y saldo anteriorNULL o cero legado. MERMA y DESPACHO
requieren ambos saldos no nulos y no negativos, preservando el cierre adicional
del destino observado. Esa exigencia también se valida al partir de010/107.
El preflight usa `IS NOT TRUE` sobre los hechos existentes; cualquier dato
incompatible aborta y conserva filas y restricciones anteriores. No se eliminan
hechos para lograr instalar108.

En el destino que coincide con la variante observada se aplica108 después de
102–106; no se fuerza107 omitiendo su preflight. En destinos con107 correctamente
aplicada,108 también es compatible. Una deriva distinta requiere diagnóstico y
no queda autorizada por esta compatibilidad focal. No reaplicar107 después de108:
su preflight histórico no reconoce el nuevo cierre no negativo.

Verificación local:

- [Ensayo focal de CHECKs y rollback](evidencia/t5-108-checks-local-2026-11-14.json):
  instalación y repetición desde010/107/variante observada, conservación,
  adversarios de cantidad/unidad/saldos, deriva de ambos CHECKs y de RPC,
  rechazo de datos históricos incompatibles. Fixture de catálogo con095 exacta.
- [Regresión T5](evidencia/t5-108-regresion-local-2026-11-14.json):
 126 grupos SQL,11 carreras y8 HTTP; instala/repite108 sobre los hechos T5 ya
 poblados, comprueba INICIO/EMBOLSADO095 real y ejecuta HTTP con el cierre108.

Ambos ensayos usan PostgreSQL14.24 privado, sin TCP ni `.env`; la regresión
T5 añade PostGIS real y HTTP/Storage sintéticos. No acreditan SQL aplicado ni
cargas en Supabase. La aplicación y su cotejo posterior se registran por entorno.

```sh
python3 scripts/qa/vivero-embolsado-108-test.py --pg-bin /ruta/postgresql/bin --evidence /ruta/nueva/108.json
npm run test:db:vivero:incorporacion -- --postgis --pg-bin /ruta/postgis/bin --evidence /ruta/nueva/t5-108.json
```
