# Coherencia de EMBOLSADO y saldo naciente

La revisión local de T5 encontró un antecedente contradictorio: el CHECK
`chk_evento_lote_vivero_saldos_eventos_vivos_requeridos` de010 exige ambos saldos
no nulos para EMBOLSADO. La RPC019 y su última redefinición095 escriben
`saldo_vivo_antes = NULL`, conforme a RF-VIV-02: INICIO conserva material en
proceso y todavía no tiene saldo de plantas vivas. Un fixture que omite los
CHECK010 no detecta este conflicto.

[107](../migrations/107_vivero_embolsado_saldo_naciente.sql) adapta las dos
restricciones, sin reescribir SQL anterior ni hechos:

- MERMA y DESPACHO siguen requiriendo ambos saldos no nulos.
- EMBOLSADO exige cantidad entera positiva en UNIDAD y saldo posterior igual.
  Admite `NULL` o cero como saldo anterior para conservar la representación
  legada010. Las RPC019/095 continúan generando `NULL`.
- Las dos restricciones quedan validadas. La base viva única de102 continúa
  impidiendo dos EMBOLSADO o la combinación EMBOLSADO/INCORPORACION.

El cero compatible no crea otro nacimiento ni incrementa el lote: esas
transacciones y la exclusión de bases conservan sus validaciones. No se atribuye
historia adicional a la diferencia entre cero y `NULL`. INCORPORACION mantiene
su propio contrato102 con saldo anterior cero.

107 comprueba la firma, el cuerpo y la configuración de la RPC095, acepta solo
las restricciones originales010 o las resultantes107 y rechaza datos
incompatibles. No repara una deriva ni modifica historia para lograr instalarse.

Antes del corte, ejecutar íntegro el [diagnóstico de catálogo de solo
lectura](../scripts/qa/vivero-incorporacion-107-diagnostico.sql) en el destino y
revisar su columna JSON. No consulta filas operativas, usuarios ni Storage; no
aplica SQL. El resultado permite contrastar cuerpos, firmas, privilegios,
restricciones, índices y triggers. La presencia de un archivo local o un número
de migración no acredita su catálogo remoto.

En el corte T5, instalar 101 y confirmar su COMMIT antes de102; continuar
102–107 en orden, incluyendo las verificaciones de Storage104 y el alta del
bucket por API oficial que describe la [guía T5](t5-incorporacion-plantas.md).
Mantener pausadas las escrituras operativas hasta completar y cotejar el corte.
No requiere reiniciar datos ni aplicar nuevamente100.

El runner T5 instala107 antes del primer EMBOLSADO representativo, sobre095/100,
para demostrar primero el fallo del CHECK010 y después la regresión M1 correcta;
es una preparación del antecedente de prueba, no una instrucción para alterar el
orden de aplicación del corte. Repite107 sobre los hechos T5 poblados y conserva
sus IDs y cantidades. Los resultados y límites se registran en la evidencia de
la revisión; no se trasladan a las evidencias anteriores.
