# Creación de subcampaña: diagnóstico del 500

16 de noviembre de 2026. Base local `3cb82e4`, rama `main`, Node `24.19.0`.
Backend observado en `localhost:3000`; Supabase configurado:
`vyrjlehkhabydkhjxagx`. Campaña comprobada: `91`, `CMP-2026-040`.

`SubcampaniasCreationService` consulta e inserta con cliente privado, pero
`SubcampaniasCodigosService` todavía invocaba `fn_generar_codigo_subcampania`
con `getClient()`. La RPC de 048 bloquea la campaña con `FOR UPDATE`; el cliente
público carece de permisos para esa operación. El generador lanza un `Error`
sin manejar y Nest lo convierte en el 500 genérico mostrado por la PWA.

Comprobación REST contra la misma campaña, sin insertar subcampañas:

| Cliente | HTTP de la RPC | Resultado |
|---|---|---|
| Público anterior | 401 | `42501: permission denied for table campania` |
| Privado | 200 | `SUB-001-CMP-2026-040` |

La corrección local usa `getAdminClient()` también en el generador, sin fallback
ni cambios de permisos SQL. Conserva DTO, respuesta y autorización ADMIN.
La meta planificada de 600 no depende de los 103 ejemplares de referencia del
vivero; el fallo ocurre antes de crear el borrador o guardar su plan.

Verificación local: la regresión de creación con el generador real reproduce
`permission denied for table campania` antes del cambio y pasa después.
`npm run build` aprobado; 97 suites y 1.413 unitarios aprobados;
`node scripts/qa/pa-int02c-openapi.cjs --check` aprobado (43 rutas, 90 schemas).

Alcance: cálculo REST y pruebas locales; no se ejecutó el POST completo contra
datos reales ni se acreditó el recorrido PWA. Sin migraciones, commit, push ni
despliegue externo en este diagnóstico.
