# Flujo end-to-end de trazabilidad

Diagrama del recorrido completo de una recolección hasta el despacho de plantas, mostrando dónde participa cada módulo del backend.

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          MÓDULO RECOLECCIONES                            │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│   Usuario en campo                                                       │
│        │                                                                 │
│        │ POST /api/recolecciones (multipart con fotos)                   │
│        ▼                                                                 │
│   estado_registro = BORRADOR                                             │
│        │                                                                 │
│        │ PATCH /:id/draft  (editable, opcional)                          │
│        ▼                                                                 │
│   PATCH /:id/submit                                                      │
│        │                                                                 │
│        ▼                                                                 │
│   estado_registro = PENDIENTE_VALIDACION                                 │
│        │                                                                 │
│        │ Validador revisa en /pending-validation                         │
│        ▼                                                                 │
│   PATCH /:id/approve  ──► IPFS upload + NFT mint                         │
│        │                  (PinataService + BlockchainService)            │
│        ▼                                                                 │
│   estado_registro = VALIDADO                                             │
│   saldo_actual = cantidad_inicial_canonica                               │
│   estado_operativo = DISPONIBLE                                          │
│                                                                          │
└──────────────────────────────────────┬──────────────────────────────────┘
                                       │
                                       │ La recolección VALIDADA con saldo
                                       │ disponible alimenta el siguiente
                                       │ módulo.
                                       │
┌──────────────────────────────────────▼──────────────────────────────────┐
│                         MÓDULO LOTES DE VIVERO                           │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│   POST /api/lotes-vivero/evidencias-pendientes  (fotos previas)         │
│        │                                                                 │
│        ▼                                                                 │
│   POST /api/lotes-vivero  (consume saldo via RPC)                       │
│        │                                                                 │
│        │  ▶ Evento INICIO en evento_lote_vivero                          │
│        │  ▶ Descuenta saldo_actual de la recoleccion                     │
│        ▼                                                                 │
│   estado_lote = ACTIVO                                                   │
│        │                                                                 │
│        │ POST /:id/embolsado/evidencias-pendientes                       │
│        │ POST /:id/embolsado            ▶ Evento EMBOLSADO               │
│        │                                  Setea plantas_vivas_actuales   │
│        ▼                                                                 │
│   POST /:id/adaptabilidad                                                │
│        │ Transiciones (validadas en RPC):                                │
│        │   SOMBRA → MEDIA_SOMBRA → SOL_DIRECTO                           │
│        ▼                                                                 │
│   POST /:id/merma  (cero o más veces)                                    │
│        │ ▶ Evento MERMA, descuenta plantas_vivas_actuales                │
│        │                                                                 │
│        │ Si llega a 0 ──► cierre automático                              │
│        │                  evento CIERRE_AUTOMATICO                       │
│        │                  motivo_cierre = PERDIDA_TOTAL                  │
│        ▼                                                                 │
│   POST /:id/despacho  ⚠ PENDIENTE DE IMPLEMENTAR                         │
│        │ Evento DESPACHO, descuenta plantas_vivas_actuales               │
│        │ Si llega a 0 ──► cierre automático con DESPACHO_TOTAL o MIXTO   │
│        ▼                                                                 │
│   estado_lote = FINALIZADO                                               │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

## Persistencia clave

| Tabla | Propósito |
|---|---|
| `recoleccion` | Registro principal + saldo materializado |
| `recoleccion_movimiento` | Descuentos/reposiciones del saldo |
| `recoleccion_historial` | Audit log inmutable de cambios de estado |
| `evidencias_trazabilidad` | Fotos polimórficas (sirve a recolección y eventos de vivero) |
| `lote_vivero` | Lote en vivero |
| `evento_lote_vivero` | Bitácora de eventos del lote |

Detalle completo en [base-de-datos.md](./base-de-datos.md).

## Integraciones externas

| Sistema | Cuándo | Para qué |
|---|---|---|
| Supabase Storage | En cada subida de fotos (recolección + eventos de vivero) | Persistencia de imágenes |
| Pinata / IPFS | En `PATCH /api/recolecciones/:id/approve` | Sube JSON NFT con metadata de la recolección |
| Blockchain (ethers + contrato `TokenJham`) | En `PATCH /api/recolecciones/:id/approve` tras Pinata | Mintea NFT con la URI de IPFS |

Ver [modulos/pinata-integracion.md](../modulos/pinata-integracion.md).

## Roles

| Rol | Permisos relevantes |
|---|---|
| `GENERAL` | Crear/editar/enviar sus propias recolecciones. Operar lotes de vivero |
| `VALIDADOR` | Todo lo de `GENERAL` + aprobar/rechazar recolecciones |
| `ADMIN` | Todo lo anterior sin restricciones de propietario |
