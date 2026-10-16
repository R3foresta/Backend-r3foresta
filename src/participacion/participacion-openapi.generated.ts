// Generado por scripts/qa/pa-int02c-openapi.cjs.
/* eslint-disable prettier/prettier */
import type { OpenAPIObject } from '@nestjs/swagger';
export const participacionOpenApi = {
  "paths": {
    "/api/v1/participacion/capacidades": {
      "get": {
        "summary": "Capacidades propias",
        "operationId": "Capacidadespropias",
        "security": [
          {
            "bearerAuth": []
          }
        ],
        "parameters": [
          {
            "name": "campania_id",
            "in": "query",
            "required": false,
            "schema": {
              "$ref": "#/components/schemas/Id"
            }
          },
          {
            "name": "cursor",
            "in": "query",
            "required": false,
            "schema": {
              "type": "string",
              "minLength": 1,
              "maxLength": 1024
            }
          },
          {
            "name": "limite",
            "in": "query",
            "required": false,
            "schema": {
              "type": "integer",
              "minimum": 1,
              "maximum": 100,
              "default": 20
            }
          }
        ],
        "responses": {
          "200": {
            "description": "Lectura privada.",
            "headers": {
              "Cache-Control": {
                "schema": {
                  "type": "string"
                },
                "description": "private, no-store"
              },
              "Vary": {
                "schema": {
                  "type": "string"
                },
                "description": "Authorization"
              }
            },
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/CapacidadesLectura"
                }
              }
            }
          },
          "401": {
            "description": "Error fuera de recibo; resultado inconcluso.",
            "headers": {
              "Cache-Control": {
                "schema": {
                  "type": "string"
                },
                "description": "private, no-store"
              },
              "Vary": {
                "schema": {
                  "type": "string"
                },
                "description": "Authorization"
              }
            },
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorFueraDeRecibo"
                }
              }
            }
          },
          "403": {
            "description": "Error fuera de recibo; resultado inconcluso.",
            "headers": {
              "Cache-Control": {
                "schema": {
                  "type": "string"
                },
                "description": "private, no-store"
              },
              "Vary": {
                "schema": {
                  "type": "string"
                },
                "description": "Authorization"
              }
            },
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorFueraDeRecibo"
                }
              }
            }
          },
          "404": {
            "description": "Error fuera de recibo; resultado inconcluso.",
            "headers": {
              "Cache-Control": {
                "schema": {
                  "type": "string"
                },
                "description": "private, no-store"
              },
              "Vary": {
                "schema": {
                  "type": "string"
                },
                "description": "Authorization"
              }
            },
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorFueraDeRecibo"
                }
              }
            }
          },
          "409": {
            "description": "Error fuera de recibo; resultado inconcluso.",
            "headers": {
              "Cache-Control": {
                "schema": {
                  "type": "string"
                },
                "description": "private, no-store"
              },
              "Vary": {
                "schema": {
                  "type": "string"
                },
                "description": "Authorization"
              }
            },
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorFueraDeRecibo"
                }
              }
            }
          },
          "422": {
            "description": "Error fuera de recibo; resultado inconcluso.",
            "headers": {
              "Cache-Control": {
                "schema": {
                  "type": "string"
                },
                "description": "private, no-store"
              },
              "Vary": {
                "schema": {
                  "type": "string"
                },
                "description": "Authorization"
              }
            },
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorFueraDeRecibo"
                }
              }
            }
          },
          "503": {
            "description": "Error fuera de recibo; resultado inconcluso.",
            "headers": {
              "Cache-Control": {
                "schema": {
                  "type": "string"
                },
                "description": "private, no-store"
              },
              "Vary": {
                "schema": {
                  "type": "string"
                },
                "description": "Authorization"
              }
            },
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorFueraDeRecibo"
                }
              }
            }
          }
        }
      }
    },
    "/api/v1/subcampanias/{id}/miembros-participacion": {
      "get": {
        "summary": "Miembros del ambito",
        "operationId": "Miembrosdelambito",
        "security": [
          {
            "bearerAuth": []
          }
        ],
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "$ref": "#/components/schemas/Id"
            }
          },
          {
            "name": "cursor",
            "in": "query",
            "required": false,
            "schema": {
              "type": "string",
              "minLength": 1,
              "maxLength": 1024
            }
          },
          {
            "name": "limite",
            "in": "query",
            "required": false,
            "schema": {
              "type": "integer",
              "minimum": 1,
              "maximum": 100,
              "default": 20
            }
          }
        ],
        "responses": {
          "200": {
            "description": "Lectura privada.",
            "headers": {
              "Cache-Control": {
                "schema": {
                  "type": "string"
                },
                "description": "private, no-store"
              },
              "Vary": {
                "schema": {
                  "type": "string"
                },
                "description": "Authorization"
              }
            },
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/MiembrosLectura"
                }
              }
            }
          },
          "401": {
            "description": "Error fuera de recibo; resultado inconcluso.",
            "headers": {
              "Cache-Control": {
                "schema": {
                  "type": "string"
                },
                "description": "private, no-store"
              },
              "Vary": {
                "schema": {
                  "type": "string"
                },
                "description": "Authorization"
              }
            },
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorFueraDeRecibo"
                }
              }
            }
          },
          "403": {
            "description": "Error fuera de recibo; resultado inconcluso.",
            "headers": {
              "Cache-Control": {
                "schema": {
                  "type": "string"
                },
                "description": "private, no-store"
              },
              "Vary": {
                "schema": {
                  "type": "string"
                },
                "description": "Authorization"
              }
            },
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorFueraDeRecibo"
                }
              }
            }
          },
          "404": {
            "description": "Error fuera de recibo; resultado inconcluso.",
            "headers": {
              "Cache-Control": {
                "schema": {
                  "type": "string"
                },
                "description": "private, no-store"
              },
              "Vary": {
                "schema": {
                  "type": "string"
                },
                "description": "Authorization"
              }
            },
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorFueraDeRecibo"
                }
              }
            }
          },
          "409": {
            "description": "Error fuera de recibo; resultado inconcluso.",
            "headers": {
              "Cache-Control": {
                "schema": {
                  "type": "string"
                },
                "description": "private, no-store"
              },
              "Vary": {
                "schema": {
                  "type": "string"
                },
                "description": "Authorization"
              }
            },
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorFueraDeRecibo"
                }
              }
            }
          },
          "422": {
            "description": "Error fuera de recibo; resultado inconcluso.",
            "headers": {
              "Cache-Control": {
                "schema": {
                  "type": "string"
                },
                "description": "private, no-store"
              },
              "Vary": {
                "schema": {
                  "type": "string"
                },
                "description": "Authorization"
              }
            },
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorFueraDeRecibo"
                }
              }
            }
          },
          "503": {
            "description": "Error fuera de recibo; resultado inconcluso.",
            "headers": {
              "Cache-Control": {
                "schema": {
                  "type": "string"
                },
                "description": "private, no-store"
              },
              "Vary": {
                "schema": {
                  "type": "string"
                },
                "description": "Authorization"
              }
            },
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorFueraDeRecibo"
                }
              }
            }
          }
        }
      }
    },
    "/api/v1/participacion/personas/buscar": {
      "post": {
        "summary": "Buscar personas",
        "operationId": "Buscarpersonas",
        "security": [
          {
            "bearerAuth": []
          }
        ],
        "parameters": [],
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "$ref": "#/components/schemas/BuscarEntrada"
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "Lectura privada.",
            "headers": {
              "Cache-Control": {
                "schema": {
                  "type": "string"
                },
                "description": "private, no-store"
              },
              "Vary": {
                "schema": {
                  "type": "string"
                },
                "description": "Authorization"
              }
            },
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PersonasLectura"
                }
              }
            }
          },
          "401": {
            "description": "Error fuera de recibo; resultado inconcluso.",
            "headers": {
              "Cache-Control": {
                "schema": {
                  "type": "string"
                },
                "description": "private, no-store"
              },
              "Vary": {
                "schema": {
                  "type": "string"
                },
                "description": "Authorization"
              }
            },
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorFueraDeRecibo"
                }
              }
            }
          },
          "403": {
            "description": "Error fuera de recibo; resultado inconcluso.",
            "headers": {
              "Cache-Control": {
                "schema": {
                  "type": "string"
                },
                "description": "private, no-store"
              },
              "Vary": {
                "schema": {
                  "type": "string"
                },
                "description": "Authorization"
              }
            },
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorFueraDeRecibo"
                }
              }
            }
          },
          "404": {
            "description": "Error fuera de recibo; resultado inconcluso.",
            "headers": {
              "Cache-Control": {
                "schema": {
                  "type": "string"
                },
                "description": "private, no-store"
              },
              "Vary": {
                "schema": {
                  "type": "string"
                },
                "description": "Authorization"
              }
            },
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorFueraDeRecibo"
                }
              }
            }
          },
          "409": {
            "description": "Error fuera de recibo; resultado inconcluso.",
            "headers": {
              "Cache-Control": {
                "schema": {
                  "type": "string"
                },
                "description": "private, no-store"
              },
              "Vary": {
                "schema": {
                  "type": "string"
                },
                "description": "Authorization"
              }
            },
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorFueraDeRecibo"
                }
              }
            }
          },
          "422": {
            "description": "Error fuera de recibo; resultado inconcluso.",
            "headers": {
              "Cache-Control": {
                "schema": {
                  "type": "string"
                },
                "description": "private, no-store"
              },
              "Vary": {
                "schema": {
                  "type": "string"
                },
                "description": "Authorization"
              }
            },
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorFueraDeRecibo"
                }
              }
            }
          },
          "503": {
            "description": "Error fuera de recibo; resultado inconcluso.",
            "headers": {
              "Cache-Control": {
                "schema": {
                  "type": "string"
                },
                "description": "private, no-store"
              },
              "Vary": {
                "schema": {
                  "type": "string"
                },
                "description": "Authorization"
              }
            },
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorFueraDeRecibo"
                }
              }
            }
          }
        }
      }
    },
    "/api/v1/participacion/accesos/revisar": {
      "post": {
        "summary": "Revisar accesos",
        "operationId": "Revisaraccesos",
        "security": [
          {
            "bearerAuth": []
          }
        ],
        "parameters": [],
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "$ref": "#/components/schemas/RevisarEntrada"
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "Lectura privada.",
            "headers": {
              "Cache-Control": {
                "schema": {
                  "type": "string"
                },
                "description": "private, no-store"
              },
              "Vary": {
                "schema": {
                  "type": "string"
                },
                "description": "Authorization"
              }
            },
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/RevisionLectura"
                }
              }
            }
          },
          "401": {
            "description": "Error fuera de recibo; resultado inconcluso.",
            "headers": {
              "Cache-Control": {
                "schema": {
                  "type": "string"
                },
                "description": "private, no-store"
              },
              "Vary": {
                "schema": {
                  "type": "string"
                },
                "description": "Authorization"
              }
            },
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorFueraDeRecibo"
                }
              }
            }
          },
          "403": {
            "description": "Error fuera de recibo; resultado inconcluso.",
            "headers": {
              "Cache-Control": {
                "schema": {
                  "type": "string"
                },
                "description": "private, no-store"
              },
              "Vary": {
                "schema": {
                  "type": "string"
                },
                "description": "Authorization"
              }
            },
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorFueraDeRecibo"
                }
              }
            }
          },
          "404": {
            "description": "Error fuera de recibo; resultado inconcluso.",
            "headers": {
              "Cache-Control": {
                "schema": {
                  "type": "string"
                },
                "description": "private, no-store"
              },
              "Vary": {
                "schema": {
                  "type": "string"
                },
                "description": "Authorization"
              }
            },
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorFueraDeRecibo"
                }
              }
            }
          },
          "409": {
            "description": "Error fuera de recibo; resultado inconcluso.",
            "headers": {
              "Cache-Control": {
                "schema": {
                  "type": "string"
                },
                "description": "private, no-store"
              },
              "Vary": {
                "schema": {
                  "type": "string"
                },
                "description": "Authorization"
              }
            },
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorFueraDeRecibo"
                }
              }
            }
          },
          "422": {
            "description": "Error fuera de recibo; resultado inconcluso.",
            "headers": {
              "Cache-Control": {
                "schema": {
                  "type": "string"
                },
                "description": "private, no-store"
              },
              "Vary": {
                "schema": {
                  "type": "string"
                },
                "description": "Authorization"
              }
            },
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorFueraDeRecibo"
                }
              }
            }
          },
          "503": {
            "description": "Error fuera de recibo; resultado inconcluso.",
            "headers": {
              "Cache-Control": {
                "schema": {
                  "type": "string"
                },
                "description": "private, no-store"
              },
              "Vary": {
                "schema": {
                  "type": "string"
                },
                "description": "Authorization"
              }
            },
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorFueraDeRecibo"
                }
              }
            }
          }
        }
      }
    },
    "/api/v1/participacion/accesos/otorgar-plantador": {
      "post": {
        "summary": "OTORGAR_PLANTADOR",
        "operationId": "OTORGARPLANTADOR",
        "security": [
          {
            "bearerAuth": []
          }
        ],
        "parameters": [],
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "$ref": "#/components/schemas/AccesoEntrada"
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "Confirmado, incluyendo replay.",
            "headers": {
              "Cache-Control": {
                "schema": {
                  "type": "string"
                },
                "description": "private, no-store"
              },
              "Vary": {
                "schema": {
                  "type": "string"
                },
                "description": "Authorization"
              }
            },
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/Confirmado"
                }
              }
            }
          },
          "401": {
            "description": "Error fuera de recibo; resultado inconcluso.",
            "headers": {
              "Cache-Control": {
                "schema": {
                  "type": "string"
                },
                "description": "private, no-store"
              },
              "Vary": {
                "schema": {
                  "type": "string"
                },
                "description": "Authorization"
              }
            },
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorFueraDeRecibo"
                }
              }
            }
          },
          "403": {
            "description": "Capacidad insuficiente durable o cuenta inactiva fuera de recibo.",
            "headers": {
              "Cache-Control": {
                "schema": {
                  "type": "string"
                },
                "description": "private, no-store"
              },
              "Vary": {
                "schema": {
                  "type": "string"
                },
                "description": "Authorization"
              }
            },
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ReciboOError"
                }
              }
            }
          },
          "404": {
            "description": "Recurso no visible durable o fuera de recibo.",
            "headers": {
              "Cache-Control": {
                "schema": {
                  "type": "string"
                },
                "description": "private, no-store"
              },
              "Vary": {
                "schema": {
                  "type": "string"
                },
                "description": "Authorization"
              }
            },
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ReciboOError"
                }
              }
            }
          },
          "409": {
            "description": "Revisión/estado/continuidad rechazados durables o clave reutilizada fuera de recibo.",
            "headers": {
              "Cache-Control": {
                "schema": {
                  "type": "string"
                },
                "description": "private, no-store"
              },
              "Vary": {
                "schema": {
                  "type": "string"
                },
                "description": "Authorization"
              }
            },
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ReciboOError"
                }
              }
            }
          },
          "422": {
            "description": "DTO inválido; no publica un rechazo durable.",
            "headers": {
              "Cache-Control": {
                "schema": {
                  "type": "string"
                },
                "description": "private, no-store"
              },
              "Vary": {
                "schema": {
                  "type": "string"
                },
                "description": "Authorization"
              }
            },
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorFueraDeRecibo"
                }
              }
            }
          },
          "503": {
            "description": "Error fuera de recibo; resultado inconcluso.",
            "headers": {
              "Cache-Control": {
                "schema": {
                  "type": "string"
                },
                "description": "private, no-store"
              },
              "Vary": {
                "schema": {
                  "type": "string"
                },
                "description": "Authorization"
              }
            },
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorFueraDeRecibo"
                }
              }
            }
          }
        }
      }
    },
    "/api/v1/participacion/accesos/retirar-plantador": {
      "post": {
        "summary": "RETIRAR_PLANTADOR",
        "operationId": "RETIRARPLANTADOR",
        "security": [
          {
            "bearerAuth": []
          }
        ],
        "parameters": [],
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "$ref": "#/components/schemas/AccesoEntrada"
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "Confirmado, incluyendo replay.",
            "headers": {
              "Cache-Control": {
                "schema": {
                  "type": "string"
                },
                "description": "private, no-store"
              },
              "Vary": {
                "schema": {
                  "type": "string"
                },
                "description": "Authorization"
              }
            },
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/Confirmado"
                }
              }
            }
          },
          "401": {
            "description": "Error fuera de recibo; resultado inconcluso.",
            "headers": {
              "Cache-Control": {
                "schema": {
                  "type": "string"
                },
                "description": "private, no-store"
              },
              "Vary": {
                "schema": {
                  "type": "string"
                },
                "description": "Authorization"
              }
            },
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorFueraDeRecibo"
                }
              }
            }
          },
          "403": {
            "description": "Capacidad insuficiente durable o cuenta inactiva fuera de recibo.",
            "headers": {
              "Cache-Control": {
                "schema": {
                  "type": "string"
                },
                "description": "private, no-store"
              },
              "Vary": {
                "schema": {
                  "type": "string"
                },
                "description": "Authorization"
              }
            },
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ReciboOError"
                }
              }
            }
          },
          "404": {
            "description": "Recurso no visible durable o fuera de recibo.",
            "headers": {
              "Cache-Control": {
                "schema": {
                  "type": "string"
                },
                "description": "private, no-store"
              },
              "Vary": {
                "schema": {
                  "type": "string"
                },
                "description": "Authorization"
              }
            },
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ReciboOError"
                }
              }
            }
          },
          "409": {
            "description": "Revisión/estado/continuidad rechazados durables o clave reutilizada fuera de recibo.",
            "headers": {
              "Cache-Control": {
                "schema": {
                  "type": "string"
                },
                "description": "private, no-store"
              },
              "Vary": {
                "schema": {
                  "type": "string"
                },
                "description": "Authorization"
              }
            },
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ReciboOError"
                }
              }
            }
          },
          "422": {
            "description": "DTO inválido; no publica un rechazo durable.",
            "headers": {
              "Cache-Control": {
                "schema": {
                  "type": "string"
                },
                "description": "private, no-store"
              },
              "Vary": {
                "schema": {
                  "type": "string"
                },
                "description": "Authorization"
              }
            },
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorFueraDeRecibo"
                }
              }
            }
          },
          "503": {
            "description": "Error fuera de recibo; resultado inconcluso.",
            "headers": {
              "Cache-Control": {
                "schema": {
                  "type": "string"
                },
                "description": "private, no-store"
              },
              "Vary": {
                "schema": {
                  "type": "string"
                },
                "description": "Authorization"
              }
            },
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorFueraDeRecibo"
                }
              }
            }
          }
        }
      }
    },
    "/api/v1/participacion/accesos/designar-administrador": {
      "post": {
        "summary": "DESIGNAR_ADMINISTRADOR",
        "operationId": "DESIGNARADMINISTRADOR",
        "security": [
          {
            "bearerAuth": []
          }
        ],
        "parameters": [],
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "$ref": "#/components/schemas/AccesoEntrada"
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "Confirmado, incluyendo replay.",
            "headers": {
              "Cache-Control": {
                "schema": {
                  "type": "string"
                },
                "description": "private, no-store"
              },
              "Vary": {
                "schema": {
                  "type": "string"
                },
                "description": "Authorization"
              }
            },
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/Confirmado"
                }
              }
            }
          },
          "401": {
            "description": "Error fuera de recibo; resultado inconcluso.",
            "headers": {
              "Cache-Control": {
                "schema": {
                  "type": "string"
                },
                "description": "private, no-store"
              },
              "Vary": {
                "schema": {
                  "type": "string"
                },
                "description": "Authorization"
              }
            },
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorFueraDeRecibo"
                }
              }
            }
          },
          "403": {
            "description": "Capacidad insuficiente durable o cuenta inactiva fuera de recibo.",
            "headers": {
              "Cache-Control": {
                "schema": {
                  "type": "string"
                },
                "description": "private, no-store"
              },
              "Vary": {
                "schema": {
                  "type": "string"
                },
                "description": "Authorization"
              }
            },
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ReciboOError"
                }
              }
            }
          },
          "404": {
            "description": "Recurso no visible durable o fuera de recibo.",
            "headers": {
              "Cache-Control": {
                "schema": {
                  "type": "string"
                },
                "description": "private, no-store"
              },
              "Vary": {
                "schema": {
                  "type": "string"
                },
                "description": "Authorization"
              }
            },
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ReciboOError"
                }
              }
            }
          },
          "409": {
            "description": "Revisión/estado/continuidad rechazados durables o clave reutilizada fuera de recibo.",
            "headers": {
              "Cache-Control": {
                "schema": {
                  "type": "string"
                },
                "description": "private, no-store"
              },
              "Vary": {
                "schema": {
                  "type": "string"
                },
                "description": "Authorization"
              }
            },
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ReciboOError"
                }
              }
            }
          },
          "422": {
            "description": "DTO inválido; no publica un rechazo durable.",
            "headers": {
              "Cache-Control": {
                "schema": {
                  "type": "string"
                },
                "description": "private, no-store"
              },
              "Vary": {
                "schema": {
                  "type": "string"
                },
                "description": "Authorization"
              }
            },
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorFueraDeRecibo"
                }
              }
            }
          },
          "503": {
            "description": "Error fuera de recibo; resultado inconcluso.",
            "headers": {
              "Cache-Control": {
                "schema": {
                  "type": "string"
                },
                "description": "private, no-store"
              },
              "Vary": {
                "schema": {
                  "type": "string"
                },
                "description": "Authorization"
              }
            },
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorFueraDeRecibo"
                }
              }
            }
          }
        }
      }
    },
    "/api/v1/participacion/accesos/administrador-a-plantador": {
      "post": {
        "summary": "CAMBIAR_ADMINISTRADOR_A_PLANTADOR",
        "operationId": "CAMBIARADMINISTRADORAPLANTADOR",
        "security": [
          {
            "bearerAuth": []
          }
        ],
        "parameters": [],
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "$ref": "#/components/schemas/AccesoEntrada"
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "Confirmado, incluyendo replay.",
            "headers": {
              "Cache-Control": {
                "schema": {
                  "type": "string"
                },
                "description": "private, no-store"
              },
              "Vary": {
                "schema": {
                  "type": "string"
                },
                "description": "Authorization"
              }
            },
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/Confirmado"
                }
              }
            }
          },
          "401": {
            "description": "Error fuera de recibo; resultado inconcluso.",
            "headers": {
              "Cache-Control": {
                "schema": {
                  "type": "string"
                },
                "description": "private, no-store"
              },
              "Vary": {
                "schema": {
                  "type": "string"
                },
                "description": "Authorization"
              }
            },
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorFueraDeRecibo"
                }
              }
            }
          },
          "403": {
            "description": "Capacidad insuficiente durable o cuenta inactiva fuera de recibo.",
            "headers": {
              "Cache-Control": {
                "schema": {
                  "type": "string"
                },
                "description": "private, no-store"
              },
              "Vary": {
                "schema": {
                  "type": "string"
                },
                "description": "Authorization"
              }
            },
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ReciboOError"
                }
              }
            }
          },
          "404": {
            "description": "Recurso no visible durable o fuera de recibo.",
            "headers": {
              "Cache-Control": {
                "schema": {
                  "type": "string"
                },
                "description": "private, no-store"
              },
              "Vary": {
                "schema": {
                  "type": "string"
                },
                "description": "Authorization"
              }
            },
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ReciboOError"
                }
              }
            }
          },
          "409": {
            "description": "Revisión/estado/continuidad rechazados durables o clave reutilizada fuera de recibo.",
            "headers": {
              "Cache-Control": {
                "schema": {
                  "type": "string"
                },
                "description": "private, no-store"
              },
              "Vary": {
                "schema": {
                  "type": "string"
                },
                "description": "Authorization"
              }
            },
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ReciboOError"
                }
              }
            }
          },
          "422": {
            "description": "DTO inválido; no publica un rechazo durable.",
            "headers": {
              "Cache-Control": {
                "schema": {
                  "type": "string"
                },
                "description": "private, no-store"
              },
              "Vary": {
                "schema": {
                  "type": "string"
                },
                "description": "Authorization"
              }
            },
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorFueraDeRecibo"
                }
              }
            }
          },
          "503": {
            "description": "Error fuera de recibo; resultado inconcluso.",
            "headers": {
              "Cache-Control": {
                "schema": {
                  "type": "string"
                },
                "description": "private, no-store"
              },
              "Vary": {
                "schema": {
                  "type": "string"
                },
                "description": "Authorization"
              }
            },
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorFueraDeRecibo"
                }
              }
            }
          }
        }
      }
    },
    "/api/v1/participacion/accesos/retirar-administrador": {
      "post": {
        "summary": "RETIRAR_ADMINISTRADOR",
        "operationId": "RETIRARADMINISTRADOR",
        "security": [
          {
            "bearerAuth": []
          }
        ],
        "parameters": [],
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "$ref": "#/components/schemas/AccesoEntrada"
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "Confirmado, incluyendo replay.",
            "headers": {
              "Cache-Control": {
                "schema": {
                  "type": "string"
                },
                "description": "private, no-store"
              },
              "Vary": {
                "schema": {
                  "type": "string"
                },
                "description": "Authorization"
              }
            },
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/Confirmado"
                }
              }
            }
          },
          "401": {
            "description": "Error fuera de recibo; resultado inconcluso.",
            "headers": {
              "Cache-Control": {
                "schema": {
                  "type": "string"
                },
                "description": "private, no-store"
              },
              "Vary": {
                "schema": {
                  "type": "string"
                },
                "description": "Authorization"
              }
            },
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorFueraDeRecibo"
                }
              }
            }
          },
          "403": {
            "description": "Capacidad insuficiente durable o cuenta inactiva fuera de recibo.",
            "headers": {
              "Cache-Control": {
                "schema": {
                  "type": "string"
                },
                "description": "private, no-store"
              },
              "Vary": {
                "schema": {
                  "type": "string"
                },
                "description": "Authorization"
              }
            },
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ReciboOError"
                }
              }
            }
          },
          "404": {
            "description": "Recurso no visible durable o fuera de recibo.",
            "headers": {
              "Cache-Control": {
                "schema": {
                  "type": "string"
                },
                "description": "private, no-store"
              },
              "Vary": {
                "schema": {
                  "type": "string"
                },
                "description": "Authorization"
              }
            },
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ReciboOError"
                }
              }
            }
          },
          "409": {
            "description": "Revisión/estado/continuidad rechazados durables o clave reutilizada fuera de recibo.",
            "headers": {
              "Cache-Control": {
                "schema": {
                  "type": "string"
                },
                "description": "private, no-store"
              },
              "Vary": {
                "schema": {
                  "type": "string"
                },
                "description": "Authorization"
              }
            },
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ReciboOError"
                }
              }
            }
          },
          "422": {
            "description": "DTO inválido; no publica un rechazo durable.",
            "headers": {
              "Cache-Control": {
                "schema": {
                  "type": "string"
                },
                "description": "private, no-store"
              },
              "Vary": {
                "schema": {
                  "type": "string"
                },
                "description": "Authorization"
              }
            },
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorFueraDeRecibo"
                }
              }
            }
          },
          "503": {
            "description": "Error fuera de recibo; resultado inconcluso.",
            "headers": {
              "Cache-Control": {
                "schema": {
                  "type": "string"
                },
                "description": "private, no-store"
              },
              "Vary": {
                "schema": {
                  "type": "string"
                },
                "description": "Authorization"
              }
            },
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorFueraDeRecibo"
                }
              }
            }
          }
        }
      }
    },
    "/api/v1/participacion/accesos/reemplazar-administrador": {
      "post": {
        "summary": "REEMPLAZAR_ADMINISTRADOR",
        "operationId": "REEMPLAZARADMINISTRADOR",
        "security": [
          {
            "bearerAuth": []
          }
        ],
        "parameters": [],
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "$ref": "#/components/schemas/ReemplazoEntrada"
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "Confirmado, incluyendo replay.",
            "headers": {
              "Cache-Control": {
                "schema": {
                  "type": "string"
                },
                "description": "private, no-store"
              },
              "Vary": {
                "schema": {
                  "type": "string"
                },
                "description": "Authorization"
              }
            },
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/Confirmado"
                }
              }
            }
          },
          "401": {
            "description": "Error fuera de recibo; resultado inconcluso.",
            "headers": {
              "Cache-Control": {
                "schema": {
                  "type": "string"
                },
                "description": "private, no-store"
              },
              "Vary": {
                "schema": {
                  "type": "string"
                },
                "description": "Authorization"
              }
            },
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorFueraDeRecibo"
                }
              }
            }
          },
          "403": {
            "description": "Capacidad insuficiente durable o cuenta inactiva fuera de recibo.",
            "headers": {
              "Cache-Control": {
                "schema": {
                  "type": "string"
                },
                "description": "private, no-store"
              },
              "Vary": {
                "schema": {
                  "type": "string"
                },
                "description": "Authorization"
              }
            },
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ReciboOError"
                }
              }
            }
          },
          "404": {
            "description": "Recurso no visible durable o fuera de recibo.",
            "headers": {
              "Cache-Control": {
                "schema": {
                  "type": "string"
                },
                "description": "private, no-store"
              },
              "Vary": {
                "schema": {
                  "type": "string"
                },
                "description": "Authorization"
              }
            },
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ReciboOError"
                }
              }
            }
          },
          "409": {
            "description": "Revisión/estado/continuidad rechazados durables o clave reutilizada fuera de recibo.",
            "headers": {
              "Cache-Control": {
                "schema": {
                  "type": "string"
                },
                "description": "private, no-store"
              },
              "Vary": {
                "schema": {
                  "type": "string"
                },
                "description": "Authorization"
              }
            },
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ReciboOError"
                }
              }
            }
          },
          "422": {
            "description": "DTO inválido; no publica un rechazo durable.",
            "headers": {
              "Cache-Control": {
                "schema": {
                  "type": "string"
                },
                "description": "private, no-store"
              },
              "Vary": {
                "schema": {
                  "type": "string"
                },
                "description": "Authorization"
              }
            },
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorFueraDeRecibo"
                }
              }
            }
          },
          "503": {
            "description": "Error fuera de recibo; resultado inconcluso.",
            "headers": {
              "Cache-Control": {
                "schema": {
                  "type": "string"
                },
                "description": "private, no-store"
              },
              "Vary": {
                "schema": {
                  "type": "string"
                },
                "description": "Authorization"
              }
            },
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorFueraDeRecibo"
                }
              }
            }
          }
        }
      }
    },
    "/api/v1/usuarios/{usuario_id}/roles": {
      "post": {
        "summary": "CAMBIAR_ROL_GLOBAL",
        "operationId": "CAMBIARROLGLOBAL",
        "security": [
          {
            "bearerAuth": []
          }
        ],
        "parameters": [
          {
            "name": "usuario_id",
            "in": "path",
            "required": true,
            "schema": {
              "$ref": "#/components/schemas/Id"
            }
          }
        ],
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "$ref": "#/components/schemas/RolesEntrada"
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "Confirmado, incluyendo replay.",
            "headers": {
              "Cache-Control": {
                "schema": {
                  "type": "string"
                },
                "description": "private, no-store"
              },
              "Vary": {
                "schema": {
                  "type": "string"
                },
                "description": "Authorization"
              }
            },
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/Confirmado"
                }
              }
            }
          },
          "401": {
            "description": "Error fuera de recibo; resultado inconcluso.",
            "headers": {
              "Cache-Control": {
                "schema": {
                  "type": "string"
                },
                "description": "private, no-store"
              },
              "Vary": {
                "schema": {
                  "type": "string"
                },
                "description": "Authorization"
              }
            },
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorFueraDeRecibo"
                }
              }
            }
          },
          "403": {
            "description": "Capacidad insuficiente durable o cuenta inactiva fuera de recibo.",
            "headers": {
              "Cache-Control": {
                "schema": {
                  "type": "string"
                },
                "description": "private, no-store"
              },
              "Vary": {
                "schema": {
                  "type": "string"
                },
                "description": "Authorization"
              }
            },
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ReciboOError"
                }
              }
            }
          },
          "404": {
            "description": "Recurso no visible durable o fuera de recibo.",
            "headers": {
              "Cache-Control": {
                "schema": {
                  "type": "string"
                },
                "description": "private, no-store"
              },
              "Vary": {
                "schema": {
                  "type": "string"
                },
                "description": "Authorization"
              }
            },
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ReciboOError"
                }
              }
            }
          },
          "409": {
            "description": "Revisión/estado/continuidad rechazados durables o clave reutilizada fuera de recibo.",
            "headers": {
              "Cache-Control": {
                "schema": {
                  "type": "string"
                },
                "description": "private, no-store"
              },
              "Vary": {
                "schema": {
                  "type": "string"
                },
                "description": "Authorization"
              }
            },
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ReciboOError"
                }
              }
            }
          },
          "422": {
            "description": "DTO inválido; no publica un rechazo durable.",
            "headers": {
              "Cache-Control": {
                "schema": {
                  "type": "string"
                },
                "description": "private, no-store"
              },
              "Vary": {
                "schema": {
                  "type": "string"
                },
                "description": "Authorization"
              }
            },
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorFueraDeRecibo"
                }
              }
            }
          },
          "503": {
            "description": "Error fuera de recibo; resultado inconcluso.",
            "headers": {
              "Cache-Control": {
                "schema": {
                  "type": "string"
                },
                "description": "private, no-store"
              },
              "Vary": {
                "schema": {
                  "type": "string"
                },
                "description": "Authorization"
              }
            },
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorFueraDeRecibo"
                }
              }
            }
          }
        }
      }
    },
    "/api/v1/usuarios/{usuario_id}/inactivaciones": {
      "post": {
        "summary": "INACTIVAR_CUENTA",
        "operationId": "INACTIVARCUENTA",
        "security": [
          {
            "bearerAuth": []
          }
        ],
        "parameters": [
          {
            "name": "usuario_id",
            "in": "path",
            "required": true,
            "schema": {
              "$ref": "#/components/schemas/Id"
            }
          }
        ],
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "$ref": "#/components/schemas/InactivacionEntrada"
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "Confirmado, incluyendo replay.",
            "headers": {
              "Cache-Control": {
                "schema": {
                  "type": "string"
                },
                "description": "private, no-store"
              },
              "Vary": {
                "schema": {
                  "type": "string"
                },
                "description": "Authorization"
              }
            },
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/Confirmado"
                }
              }
            }
          },
          "401": {
            "description": "Error fuera de recibo; resultado inconcluso.",
            "headers": {
              "Cache-Control": {
                "schema": {
                  "type": "string"
                },
                "description": "private, no-store"
              },
              "Vary": {
                "schema": {
                  "type": "string"
                },
                "description": "Authorization"
              }
            },
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorFueraDeRecibo"
                }
              }
            }
          },
          "403": {
            "description": "Capacidad insuficiente durable o cuenta inactiva fuera de recibo.",
            "headers": {
              "Cache-Control": {
                "schema": {
                  "type": "string"
                },
                "description": "private, no-store"
              },
              "Vary": {
                "schema": {
                  "type": "string"
                },
                "description": "Authorization"
              }
            },
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ReciboOError"
                }
              }
            }
          },
          "404": {
            "description": "Recurso no visible durable o fuera de recibo.",
            "headers": {
              "Cache-Control": {
                "schema": {
                  "type": "string"
                },
                "description": "private, no-store"
              },
              "Vary": {
                "schema": {
                  "type": "string"
                },
                "description": "Authorization"
              }
            },
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ReciboOError"
                }
              }
            }
          },
          "409": {
            "description": "Revisión/estado/continuidad rechazados durables o clave reutilizada fuera de recibo.",
            "headers": {
              "Cache-Control": {
                "schema": {
                  "type": "string"
                },
                "description": "private, no-store"
              },
              "Vary": {
                "schema": {
                  "type": "string"
                },
                "description": "Authorization"
              }
            },
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ReciboOError"
                }
              }
            }
          },
          "422": {
            "description": "DTO inválido; no publica un rechazo durable.",
            "headers": {
              "Cache-Control": {
                "schema": {
                  "type": "string"
                },
                "description": "private, no-store"
              },
              "Vary": {
                "schema": {
                  "type": "string"
                },
                "description": "Authorization"
              }
            },
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorFueraDeRecibo"
                }
              }
            }
          },
          "503": {
            "description": "Error fuera de recibo; resultado inconcluso.",
            "headers": {
              "Cache-Control": {
                "schema": {
                  "type": "string"
                },
                "description": "private, no-store"
              },
              "Vary": {
                "schema": {
                  "type": "string"
                },
                "description": "Authorization"
              }
            },
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorFueraDeRecibo"
                }
              }
            }
          }
        }
      }
    },
    "/api/v1/usuarios/{usuario_id}/autoridad": {
      "get": {
        "summary": "Leer autoridad",
        "operationId": "Leerautoridad",
        "security": [
          {
            "bearerAuth": []
          }
        ],
        "parameters": [
          {
            "name": "usuario_id",
            "in": "path",
            "required": true,
            "schema": {
              "$ref": "#/components/schemas/Id"
            }
          }
        ],
        "responses": {
          "200": {
            "description": "Lectura privada.",
            "headers": {
              "Cache-Control": {
                "schema": {
                  "type": "string"
                },
                "description": "private, no-store"
              },
              "Vary": {
                "schema": {
                  "type": "string"
                },
                "description": "Authorization"
              }
            },
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/AutoridadLectura"
                }
              }
            }
          },
          "401": {
            "description": "Error fuera de recibo; resultado inconcluso.",
            "headers": {
              "Cache-Control": {
                "schema": {
                  "type": "string"
                },
                "description": "private, no-store"
              },
              "Vary": {
                "schema": {
                  "type": "string"
                },
                "description": "Authorization"
              }
            },
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorFueraDeRecibo"
                }
              }
            }
          },
          "403": {
            "description": "Error fuera de recibo; resultado inconcluso.",
            "headers": {
              "Cache-Control": {
                "schema": {
                  "type": "string"
                },
                "description": "private, no-store"
              },
              "Vary": {
                "schema": {
                  "type": "string"
                },
                "description": "Authorization"
              }
            },
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorFueraDeRecibo"
                }
              }
            }
          },
          "404": {
            "description": "Error fuera de recibo; resultado inconcluso.",
            "headers": {
              "Cache-Control": {
                "schema": {
                  "type": "string"
                },
                "description": "private, no-store"
              },
              "Vary": {
                "schema": {
                  "type": "string"
                },
                "description": "Authorization"
              }
            },
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorFueraDeRecibo"
                }
              }
            }
          },
          "409": {
            "description": "Error fuera de recibo; resultado inconcluso.",
            "headers": {
              "Cache-Control": {
                "schema": {
                  "type": "string"
                },
                "description": "private, no-store"
              },
              "Vary": {
                "schema": {
                  "type": "string"
                },
                "description": "Authorization"
              }
            },
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorFueraDeRecibo"
                }
              }
            }
          },
          "422": {
            "description": "Error fuera de recibo; resultado inconcluso.",
            "headers": {
              "Cache-Control": {
                "schema": {
                  "type": "string"
                },
                "description": "private, no-store"
              },
              "Vary": {
                "schema": {
                  "type": "string"
                },
                "description": "Authorization"
              }
            },
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorFueraDeRecibo"
                }
              }
            }
          },
          "503": {
            "description": "Error fuera de recibo; resultado inconcluso.",
            "headers": {
              "Cache-Control": {
                "schema": {
                  "type": "string"
                },
                "description": "private, no-store"
              },
              "Vary": {
                "schema": {
                  "type": "string"
                },
                "description": "Authorization"
              }
            },
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorFueraDeRecibo"
                }
              }
            }
          }
        }
      }
    },
    "/api/v1/participacion/comandos/{comando_id}": {
      "get": {
        "summary": "Recuperar comando propio",
        "operationId": "Recuperarcomandopropio",
        "security": [
          {
            "bearerAuth": []
          }
        ],
        "parameters": [
          {
            "name": "comando_id",
            "in": "path",
            "required": true,
            "schema": {
              "$ref": "#/components/schemas/ComandoId"
            }
          },
          {
            "name": "operacion",
            "in": "query",
            "required": true,
            "schema": {
              "type": "string",
              "enum": [
                "OTORGAR_PLANTADOR",
                "RETIRAR_PLANTADOR",
                "DESIGNAR_ADMINISTRADOR",
                "CAMBIAR_ADMINISTRADOR_A_PLANTADOR",
                "RETIRAR_ADMINISTRADOR",
                "REEMPLAZAR_ADMINISTRADOR",
                "CAMBIAR_ROL_GLOBAL",
                "INACTIVAR_CUENTA",
                "REGISTRAR_PLANTACION_INICIAL"
              ]
            }
          }
        ],
        "responses": {
          "200": {
            "description": "Lectura privada.",
            "headers": {
              "Cache-Control": {
                "schema": {
                  "type": "string"
                },
                "description": "private, no-store"
              },
              "Vary": {
                "schema": {
                  "type": "string"
                },
                "description": "Authorization"
              }
            },
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/Recibo"
                }
              }
            }
          },
          "202": {
            "description": "Preparado sin resultado; repetir misma clave y consultar con backoff.",
            "headers": {
              "Cache-Control": {
                "schema": {
                  "type": "string"
                },
                "description": "private, no-store"
              },
              "Vary": {
                "schema": {
                  "type": "string"
                },
                "description": "Authorization"
              },
              "Retry-After": {
                "schema": {
                  "type": "string",
                  "enum": [
                    "2"
                  ]
                }
              }
            },
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/SinResultado"
                }
              }
            }
          },
          "401": {
            "description": "Error fuera de recibo; resultado inconcluso.",
            "headers": {
              "Cache-Control": {
                "schema": {
                  "type": "string"
                },
                "description": "private, no-store"
              },
              "Vary": {
                "schema": {
                  "type": "string"
                },
                "description": "Authorization"
              }
            },
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorFueraDeRecibo"
                }
              }
            }
          },
          "403": {
            "description": "Error fuera de recibo; resultado inconcluso.",
            "headers": {
              "Cache-Control": {
                "schema": {
                  "type": "string"
                },
                "description": "private, no-store"
              },
              "Vary": {
                "schema": {
                  "type": "string"
                },
                "description": "Authorization"
              }
            },
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorFueraDeRecibo"
                }
              }
            }
          },
          "404": {
            "description": "Error fuera de recibo; resultado inconcluso.",
            "headers": {
              "Cache-Control": {
                "schema": {
                  "type": "string"
                },
                "description": "private, no-store"
              },
              "Vary": {
                "schema": {
                  "type": "string"
                },
                "description": "Authorization"
              }
            },
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorFueraDeRecibo"
                }
              }
            }
          },
          "409": {
            "description": "Error fuera de recibo; resultado inconcluso.",
            "headers": {
              "Cache-Control": {
                "schema": {
                  "type": "string"
                },
                "description": "private, no-store"
              },
              "Vary": {
                "schema": {
                  "type": "string"
                },
                "description": "Authorization"
              }
            },
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorFueraDeRecibo"
                }
              }
            }
          },
          "422": {
            "description": "Error fuera de recibo; resultado inconcluso.",
            "headers": {
              "Cache-Control": {
                "schema": {
                  "type": "string"
                },
                "description": "private, no-store"
              },
              "Vary": {
                "schema": {
                  "type": "string"
                },
                "description": "Authorization"
              }
            },
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorFueraDeRecibo"
                }
              }
            }
          },
          "503": {
            "description": "Error fuera de recibo; resultado inconcluso.",
            "headers": {
              "Cache-Control": {
                "schema": {
                  "type": "string"
                },
                "description": "private, no-store"
              },
              "Vary": {
                "schema": {
                  "type": "string"
                },
                "description": "Authorization"
              }
            },
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorFueraDeRecibo"
                }
              }
            }
          }
        }
      }
    },
    "/api/v1/subcampanias/{id}/contexto-registro": {
      "get": {
        "summary": "Contexto de registro",
        "operationId": "Contextoderegistro",
        "security": [
          {
            "bearerAuth": []
          }
        ],
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "$ref": "#/components/schemas/Id"
            }
          }
        ],
        "responses": {
          "200": {
            "description": "Lectura privada.",
            "headers": {
              "Cache-Control": {
                "schema": {
                  "type": "string"
                },
                "description": "private, no-store"
              },
              "Vary": {
                "schema": {
                  "type": "string"
                },
                "description": "Authorization"
              }
            },
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ContextoRegistroLectura"
                }
              }
            }
          },
          "401": {
            "description": "Error fuera de recibo; resultado inconcluso.",
            "headers": {
              "Cache-Control": {
                "schema": {
                  "type": "string"
                },
                "description": "private, no-store"
              },
              "Vary": {
                "schema": {
                  "type": "string"
                },
                "description": "Authorization"
              }
            },
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorFueraDeRecibo"
                }
              }
            }
          },
          "403": {
            "description": "Error fuera de recibo; resultado inconcluso.",
            "headers": {
              "Cache-Control": {
                "schema": {
                  "type": "string"
                },
                "description": "private, no-store"
              },
              "Vary": {
                "schema": {
                  "type": "string"
                },
                "description": "Authorization"
              }
            },
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorFueraDeRecibo"
                }
              }
            }
          },
          "404": {
            "description": "Error fuera de recibo; resultado inconcluso.",
            "headers": {
              "Cache-Control": {
                "schema": {
                  "type": "string"
                },
                "description": "private, no-store"
              },
              "Vary": {
                "schema": {
                  "type": "string"
                },
                "description": "Authorization"
              }
            },
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorFueraDeRecibo"
                }
              }
            }
          },
          "409": {
            "description": "Error fuera de recibo; resultado inconcluso.",
            "headers": {
              "Cache-Control": {
                "schema": {
                  "type": "string"
                },
                "description": "private, no-store"
              },
              "Vary": {
                "schema": {
                  "type": "string"
                },
                "description": "Authorization"
              }
            },
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorFueraDeRecibo"
                }
              }
            }
          },
          "422": {
            "description": "Error fuera de recibo; resultado inconcluso.",
            "headers": {
              "Cache-Control": {
                "schema": {
                  "type": "string"
                },
                "description": "private, no-store"
              },
              "Vary": {
                "schema": {
                  "type": "string"
                },
                "description": "Authorization"
              }
            },
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorFueraDeRecibo"
                }
              }
            }
          },
          "503": {
            "description": "Error fuera de recibo; resultado inconcluso.",
            "headers": {
              "Cache-Control": {
                "schema": {
                  "type": "string"
                },
                "description": "private, no-store"
              },
              "Vary": {
                "schema": {
                  "type": "string"
                },
                "description": "Authorization"
              }
            },
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorFueraDeRecibo"
                }
              }
            }
          }
        }
      }
    },
    "/api/v1/subcampanias/{id}/participantes-seleccionables": {
      "get": {
        "summary": "Participantes elegibles",
        "operationId": "Participanteselegibles",
        "security": [
          {
            "bearerAuth": []
          }
        ],
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "$ref": "#/components/schemas/Id"
            }
          },
          {
            "name": "q",
            "in": "query",
            "required": false,
            "schema": {
              "type": "string",
              "minLength": 2,
              "maxLength": 100
            }
          },
          {
            "name": "cursor",
            "in": "query",
            "required": false,
            "schema": {
              "type": "string",
              "minLength": 1,
              "maxLength": 1024
            }
          },
          {
            "name": "limite",
            "in": "query",
            "required": false,
            "schema": {
              "type": "integer",
              "minimum": 1,
              "maximum": 20,
              "default": 20
            }
          }
        ],
        "responses": {
          "200": {
            "description": "Lectura privada.",
            "headers": {
              "Cache-Control": {
                "schema": {
                  "type": "string"
                },
                "description": "private, no-store"
              },
              "Vary": {
                "schema": {
                  "type": "string"
                },
                "description": "Authorization"
              }
            },
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PersonasLectura"
                }
              }
            }
          },
          "401": {
            "description": "Error fuera de recibo; resultado inconcluso.",
            "headers": {
              "Cache-Control": {
                "schema": {
                  "type": "string"
                },
                "description": "private, no-store"
              },
              "Vary": {
                "schema": {
                  "type": "string"
                },
                "description": "Authorization"
              }
            },
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorFueraDeRecibo"
                }
              }
            }
          },
          "403": {
            "description": "Error fuera de recibo; resultado inconcluso.",
            "headers": {
              "Cache-Control": {
                "schema": {
                  "type": "string"
                },
                "description": "private, no-store"
              },
              "Vary": {
                "schema": {
                  "type": "string"
                },
                "description": "Authorization"
              }
            },
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorFueraDeRecibo"
                }
              }
            }
          },
          "404": {
            "description": "Error fuera de recibo; resultado inconcluso.",
            "headers": {
              "Cache-Control": {
                "schema": {
                  "type": "string"
                },
                "description": "private, no-store"
              },
              "Vary": {
                "schema": {
                  "type": "string"
                },
                "description": "Authorization"
              }
            },
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorFueraDeRecibo"
                }
              }
            }
          },
          "409": {
            "description": "Error fuera de recibo; resultado inconcluso.",
            "headers": {
              "Cache-Control": {
                "schema": {
                  "type": "string"
                },
                "description": "private, no-store"
              },
              "Vary": {
                "schema": {
                  "type": "string"
                },
                "description": "Authorization"
              }
            },
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorFueraDeRecibo"
                }
              }
            }
          },
          "422": {
            "description": "Error fuera de recibo; resultado inconcluso.",
            "headers": {
              "Cache-Control": {
                "schema": {
                  "type": "string"
                },
                "description": "private, no-store"
              },
              "Vary": {
                "schema": {
                  "type": "string"
                },
                "description": "Authorization"
              }
            },
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorFueraDeRecibo"
                }
              }
            }
          },
          "503": {
            "description": "Error fuera de recibo; resultado inconcluso.",
            "headers": {
              "Cache-Control": {
                "schema": {
                  "type": "string"
                },
                "description": "private, no-store"
              },
              "Vary": {
                "schema": {
                  "type": "string"
                },
                "description": "Authorization"
              }
            },
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorFueraDeRecibo"
                }
              }
            }
          }
        }
      }
    },
    "/api/v1/plantaciones/iniciales": {
      "post": {
        "summary": "REGISTRAR_PLANTACION_INICIAL",
        "operationId": "REGISTRARPLANTACIONINICIAL",
        "security": [
          {
            "bearerAuth": []
          }
        ],
        "parameters": [],
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "$ref": "#/components/schemas/RegistroInicialEntrada"
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "Confirmado, incluyendo replay.",
            "headers": {
              "Cache-Control": {
                "schema": {
                  "type": "string"
                },
                "description": "private, no-store"
              },
              "Vary": {
                "schema": {
                  "type": "string"
                },
                "description": "Authorization"
              }
            },
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/Confirmado"
                }
              }
            }
          },
          "401": {
            "description": "Error fuera de recibo; resultado inconcluso.",
            "headers": {
              "Cache-Control": {
                "schema": {
                  "type": "string"
                },
                "description": "private, no-store"
              },
              "Vary": {
                "schema": {
                  "type": "string"
                },
                "description": "Authorization"
              }
            },
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorFueraDeRecibo"
                }
              }
            }
          },
          "403": {
            "description": "Capacidad insuficiente durable o cuenta inactiva fuera de recibo.",
            "headers": {
              "Cache-Control": {
                "schema": {
                  "type": "string"
                },
                "description": "private, no-store"
              },
              "Vary": {
                "schema": {
                  "type": "string"
                },
                "description": "Authorization"
              }
            },
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ReciboOError"
                }
              }
            }
          },
          "404": {
            "description": "Recurso no visible durable o fuera de recibo.",
            "headers": {
              "Cache-Control": {
                "schema": {
                  "type": "string"
                },
                "description": "private, no-store"
              },
              "Vary": {
                "schema": {
                  "type": "string"
                },
                "description": "Authorization"
              }
            },
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ReciboOError"
                }
              }
            }
          },
          "409": {
            "description": "Revisión/estado/continuidad rechazados durables o clave reutilizada fuera de recibo.",
            "headers": {
              "Cache-Control": {
                "schema": {
                  "type": "string"
                },
                "description": "private, no-store"
              },
              "Vary": {
                "schema": {
                  "type": "string"
                },
                "description": "Authorization"
              }
            },
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ReciboOError"
                }
              }
            }
          },
          "422": {
            "description": "DTO inválido fuera de recibo o validación de negocio durable.",
            "headers": {
              "Cache-Control": {
                "schema": {
                  "type": "string"
                },
                "description": "private, no-store"
              },
              "Vary": {
                "schema": {
                  "type": "string"
                },
                "description": "Authorization"
              }
            },
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ReciboOError"
                }
              }
            }
          },
          "503": {
            "description": "Evaluador sin resultado durable o infraestructura inconclusa.",
            "headers": {
              "Cache-Control": {
                "schema": {
                  "type": "string"
                },
                "description": "private, no-store"
              },
              "Vary": {
                "schema": {
                  "type": "string"
                },
                "description": "Authorization"
              }
            },
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ReciboOError"
                }
              }
            }
          }
        }
      }
    },
    "/api/v1/plantaciones/{id}/detalle-propio": {
      "get": {
        "summary": "Detalle propio histórico",
        "operationId": "Detallepropiohistrico",
        "security": [
          {
            "bearerAuth": []
          }
        ],
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "$ref": "#/components/schemas/Id"
            }
          }
        ],
        "responses": {
          "200": {
            "description": "Lectura privada.",
            "headers": {
              "Cache-Control": {
                "schema": {
                  "type": "string"
                },
                "description": "private, no-store"
              },
              "Vary": {
                "schema": {
                  "type": "string"
                },
                "description": "Authorization"
              }
            },
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/DetallePropioLectura"
                }
              }
            }
          },
          "401": {
            "description": "Error fuera de recibo; resultado inconcluso.",
            "headers": {
              "Cache-Control": {
                "schema": {
                  "type": "string"
                },
                "description": "private, no-store"
              },
              "Vary": {
                "schema": {
                  "type": "string"
                },
                "description": "Authorization"
              }
            },
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorFueraDeRecibo"
                }
              }
            }
          },
          "403": {
            "description": "Error fuera de recibo; resultado inconcluso.",
            "headers": {
              "Cache-Control": {
                "schema": {
                  "type": "string"
                },
                "description": "private, no-store"
              },
              "Vary": {
                "schema": {
                  "type": "string"
                },
                "description": "Authorization"
              }
            },
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorFueraDeRecibo"
                }
              }
            }
          },
          "404": {
            "description": "Error fuera de recibo; resultado inconcluso.",
            "headers": {
              "Cache-Control": {
                "schema": {
                  "type": "string"
                },
                "description": "private, no-store"
              },
              "Vary": {
                "schema": {
                  "type": "string"
                },
                "description": "Authorization"
              }
            },
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorFueraDeRecibo"
                }
              }
            }
          },
          "409": {
            "description": "Error fuera de recibo; resultado inconcluso.",
            "headers": {
              "Cache-Control": {
                "schema": {
                  "type": "string"
                },
                "description": "private, no-store"
              },
              "Vary": {
                "schema": {
                  "type": "string"
                },
                "description": "Authorization"
              }
            },
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorFueraDeRecibo"
                }
              }
            }
          },
          "422": {
            "description": "Error fuera de recibo; resultado inconcluso.",
            "headers": {
              "Cache-Control": {
                "schema": {
                  "type": "string"
                },
                "description": "private, no-store"
              },
              "Vary": {
                "schema": {
                  "type": "string"
                },
                "description": "Authorization"
              }
            },
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorFueraDeRecibo"
                }
              }
            }
          },
          "503": {
            "description": "Error fuera de recibo; resultado inconcluso.",
            "headers": {
              "Cache-Control": {
                "schema": {
                  "type": "string"
                },
                "description": "private, no-store"
              },
              "Vary": {
                "schema": {
                  "type": "string"
                },
                "description": "Authorization"
              }
            },
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorFueraDeRecibo"
                }
              }
            }
          }
        }
      }
    },
    "/api/v1/participacion/comandos/preparaciones": {
      "post": {
        "summary": "Preparar cargas propias",
        "operationId": "Prepararcargaspropias",
        "security": [
          {
            "bearerAuth": []
          }
        ],
        "parameters": [],
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "$ref": "#/components/schemas/PreparacionEntrada"
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "Lectura privada.",
            "headers": {
              "Cache-Control": {
                "schema": {
                  "type": "string"
                },
                "description": "private, no-store"
              },
              "Vary": {
                "schema": {
                  "type": "string"
                },
                "description": "Authorization"
              }
            },
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PreparacionORecibo"
                }
              }
            }
          },
          "401": {
            "description": "Error fuera de recibo; resultado inconcluso.",
            "headers": {
              "Cache-Control": {
                "schema": {
                  "type": "string"
                },
                "description": "private, no-store"
              },
              "Vary": {
                "schema": {
                  "type": "string"
                },
                "description": "Authorization"
              }
            },
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorFueraDeRecibo"
                }
              }
            }
          },
          "403": {
            "description": "Error fuera de recibo; resultado inconcluso.",
            "headers": {
              "Cache-Control": {
                "schema": {
                  "type": "string"
                },
                "description": "private, no-store"
              },
              "Vary": {
                "schema": {
                  "type": "string"
                },
                "description": "Authorization"
              }
            },
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorFueraDeRecibo"
                }
              }
            }
          },
          "404": {
            "description": "Error fuera de recibo; resultado inconcluso.",
            "headers": {
              "Cache-Control": {
                "schema": {
                  "type": "string"
                },
                "description": "private, no-store"
              },
              "Vary": {
                "schema": {
                  "type": "string"
                },
                "description": "Authorization"
              }
            },
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorFueraDeRecibo"
                }
              }
            }
          },
          "409": {
            "description": "Error fuera de recibo; resultado inconcluso.",
            "headers": {
              "Cache-Control": {
                "schema": {
                  "type": "string"
                },
                "description": "private, no-store"
              },
              "Vary": {
                "schema": {
                  "type": "string"
                },
                "description": "Authorization"
              }
            },
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorFueraDeRecibo"
                }
              }
            }
          },
          "422": {
            "description": "Error fuera de recibo; resultado inconcluso.",
            "headers": {
              "Cache-Control": {
                "schema": {
                  "type": "string"
                },
                "description": "private, no-store"
              },
              "Vary": {
                "schema": {
                  "type": "string"
                },
                "description": "Authorization"
              }
            },
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorFueraDeRecibo"
                }
              }
            }
          },
          "503": {
            "description": "Error fuera de recibo; resultado inconcluso.",
            "headers": {
              "Cache-Control": {
                "schema": {
                  "type": "string"
                },
                "description": "private, no-store"
              },
              "Vary": {
                "schema": {
                  "type": "string"
                },
                "description": "Authorization"
              }
            },
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorFueraDeRecibo"
                }
              }
            }
          }
        }
      }
    },
    "/api/v1/participacion/comandos/{comando_id}/cargas/{carga_id}": {
      "put": {
        "summary": "Cargar foto recuperable",
        "operationId": "Cargarfotorecuperable",
        "security": [
          {
            "bearerAuth": []
          }
        ],
        "parameters": [
          {
            "name": "comando_id",
            "in": "path",
            "required": true,
            "schema": {
              "$ref": "#/components/schemas/ComandoId"
            }
          },
          {
            "name": "carga_id",
            "in": "path",
            "required": true,
            "schema": {
              "$ref": "#/components/schemas/ComandoId"
            }
          },
          {
            "name": "operacion",
            "in": "query",
            "required": true,
            "schema": {
              "type": "string",
              "enum": [
                "REGISTRAR_PLANTACION_INICIAL"
              ]
            }
          }
        ],
        "responses": {
          "200": {
            "description": "Lectura privada.",
            "headers": {
              "Cache-Control": {
                "schema": {
                  "type": "string"
                },
                "description": "private, no-store"
              },
              "Vary": {
                "schema": {
                  "type": "string"
                },
                "description": "Authorization"
              }
            },
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/CargaLectura"
                }
              }
            }
          },
          "201": {
            "description": "Nueva carga disponible.",
            "headers": {
              "Cache-Control": {
                "schema": {
                  "type": "string"
                },
                "description": "private, no-store"
              },
              "Vary": {
                "schema": {
                  "type": "string"
                },
                "description": "Authorization"
              }
            },
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/CargaLectura"
                }
              }
            }
          },
          "202": {
            "description": "Lease vigente; estado reservado inconcluso.",
            "headers": {
              "Cache-Control": {
                "schema": {
                  "type": "string"
                },
                "description": "private, no-store"
              },
              "Vary": {
                "schema": {
                  "type": "string"
                },
                "description": "Authorization"
              },
              "Retry-After": {
                "schema": {
                  "type": "string",
                  "enum": [
                    "2"
                  ]
                }
              }
            },
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/CargaLectura"
                }
              }
            }
          },
          "401": {
            "description": "Error fuera de recibo; resultado inconcluso.",
            "headers": {
              "Cache-Control": {
                "schema": {
                  "type": "string"
                },
                "description": "private, no-store"
              },
              "Vary": {
                "schema": {
                  "type": "string"
                },
                "description": "Authorization"
              }
            },
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorFueraDeRecibo"
                }
              }
            }
          },
          "403": {
            "description": "Error fuera de recibo; resultado inconcluso.",
            "headers": {
              "Cache-Control": {
                "schema": {
                  "type": "string"
                },
                "description": "private, no-store"
              },
              "Vary": {
                "schema": {
                  "type": "string"
                },
                "description": "Authorization"
              }
            },
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorFueraDeRecibo"
                }
              }
            }
          },
          "404": {
            "description": "Error fuera de recibo; resultado inconcluso.",
            "headers": {
              "Cache-Control": {
                "schema": {
                  "type": "string"
                },
                "description": "private, no-store"
              },
              "Vary": {
                "schema": {
                  "type": "string"
                },
                "description": "Authorization"
              }
            },
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorFueraDeRecibo"
                }
              }
            }
          },
          "409": {
            "description": "Error fuera de recibo; resultado inconcluso.",
            "headers": {
              "Cache-Control": {
                "schema": {
                  "type": "string"
                },
                "description": "private, no-store"
              },
              "Vary": {
                "schema": {
                  "type": "string"
                },
                "description": "Authorization"
              }
            },
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorFueraDeRecibo"
                }
              }
            }
          },
          "422": {
            "description": "Error fuera de recibo; resultado inconcluso.",
            "headers": {
              "Cache-Control": {
                "schema": {
                  "type": "string"
                },
                "description": "private, no-store"
              },
              "Vary": {
                "schema": {
                  "type": "string"
                },
                "description": "Authorization"
              }
            },
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorFueraDeRecibo"
                }
              }
            }
          },
          "503": {
            "description": "Error fuera de recibo; resultado inconcluso.",
            "headers": {
              "Cache-Control": {
                "schema": {
                  "type": "string"
                },
                "description": "private, no-store"
              },
              "Vary": {
                "schema": {
                  "type": "string"
                },
                "description": "Authorization"
              }
            },
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorFueraDeRecibo"
                }
              }
            }
          }
        },
        "requestBody": {
          "required": true,
          "content": {
            "multipart/form-data": {
              "schema": {
                "type": "object",
                "additionalProperties": false,
                "properties": {
                  "foto": {
                    "type": "string",
                    "format": "binary",
                    "description": "Un archivo hasta 10 MiB. JPG/JPEG/PNG/WEBP/HEIC/HEIF decodificado; sin metadata libre."
                  }
                },
                "required": [
                  "foto"
                ]
              }
            }
          }
        }
      }
    },
    "/api/v1/participacion/comandos/{comando_id}/cargas": {
      "get": {
        "summary": "Listar cargas propias",
        "operationId": "Listarcargaspropias",
        "security": [
          {
            "bearerAuth": []
          }
        ],
        "parameters": [
          {
            "name": "comando_id",
            "in": "path",
            "required": true,
            "schema": {
              "$ref": "#/components/schemas/ComandoId"
            }
          },
          {
            "name": "operacion",
            "in": "query",
            "required": true,
            "schema": {
              "type": "string",
              "enum": [
                "REGISTRAR_PLANTACION_INICIAL"
              ]
            }
          }
        ],
        "responses": {
          "200": {
            "description": "Lectura privada.",
            "headers": {
              "Cache-Control": {
                "schema": {
                  "type": "string"
                },
                "description": "private, no-store"
              },
              "Vary": {
                "schema": {
                  "type": "string"
                },
                "description": "Authorization"
              }
            },
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/CargasLectura"
                }
              }
            }
          },
          "401": {
            "description": "Error fuera de recibo; resultado inconcluso.",
            "headers": {
              "Cache-Control": {
                "schema": {
                  "type": "string"
                },
                "description": "private, no-store"
              },
              "Vary": {
                "schema": {
                  "type": "string"
                },
                "description": "Authorization"
              }
            },
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorFueraDeRecibo"
                }
              }
            }
          },
          "403": {
            "description": "Error fuera de recibo; resultado inconcluso.",
            "headers": {
              "Cache-Control": {
                "schema": {
                  "type": "string"
                },
                "description": "private, no-store"
              },
              "Vary": {
                "schema": {
                  "type": "string"
                },
                "description": "Authorization"
              }
            },
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorFueraDeRecibo"
                }
              }
            }
          },
          "404": {
            "description": "Error fuera de recibo; resultado inconcluso.",
            "headers": {
              "Cache-Control": {
                "schema": {
                  "type": "string"
                },
                "description": "private, no-store"
              },
              "Vary": {
                "schema": {
                  "type": "string"
                },
                "description": "Authorization"
              }
            },
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorFueraDeRecibo"
                }
              }
            }
          },
          "409": {
            "description": "Error fuera de recibo; resultado inconcluso.",
            "headers": {
              "Cache-Control": {
                "schema": {
                  "type": "string"
                },
                "description": "private, no-store"
              },
              "Vary": {
                "schema": {
                  "type": "string"
                },
                "description": "Authorization"
              }
            },
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorFueraDeRecibo"
                }
              }
            }
          },
          "422": {
            "description": "Error fuera de recibo; resultado inconcluso.",
            "headers": {
              "Cache-Control": {
                "schema": {
                  "type": "string"
                },
                "description": "private, no-store"
              },
              "Vary": {
                "schema": {
                  "type": "string"
                },
                "description": "Authorization"
              }
            },
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorFueraDeRecibo"
                }
              }
            }
          },
          "503": {
            "description": "Error fuera de recibo; resultado inconcluso.",
            "headers": {
              "Cache-Control": {
                "schema": {
                  "type": "string"
                },
                "description": "private, no-store"
              },
              "Vary": {
                "schema": {
                  "type": "string"
                },
                "description": "Authorization"
              }
            },
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorFueraDeRecibo"
                }
              }
            }
          }
        }
      }
    },
    "/api/v1/participacion/comandos/{comando_id}/descarte-preparacion": {
      "post": {
        "summary": "Descartar preparación propia",
        "operationId": "Descartarpreparacinpropia",
        "security": [
          {
            "bearerAuth": []
          }
        ],
        "parameters": [
          {
            "name": "comando_id",
            "in": "path",
            "required": true,
            "schema": {
              "$ref": "#/components/schemas/ComandoId"
            }
          }
        ],
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "$ref": "#/components/schemas/DescartePreparacionEntrada"
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "Lectura privada.",
            "headers": {
              "Cache-Control": {
                "schema": {
                  "type": "string"
                },
                "description": "private, no-store"
              },
              "Vary": {
                "schema": {
                  "type": "string"
                },
                "description": "Authorization"
              }
            },
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/Recibo"
                }
              }
            }
          },
          "401": {
            "description": "Error fuera de recibo; resultado inconcluso.",
            "headers": {
              "Cache-Control": {
                "schema": {
                  "type": "string"
                },
                "description": "private, no-store"
              },
              "Vary": {
                "schema": {
                  "type": "string"
                },
                "description": "Authorization"
              }
            },
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorFueraDeRecibo"
                }
              }
            }
          },
          "403": {
            "description": "Error fuera de recibo; resultado inconcluso.",
            "headers": {
              "Cache-Control": {
                "schema": {
                  "type": "string"
                },
                "description": "private, no-store"
              },
              "Vary": {
                "schema": {
                  "type": "string"
                },
                "description": "Authorization"
              }
            },
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorFueraDeRecibo"
                }
              }
            }
          },
          "404": {
            "description": "Error fuera de recibo; resultado inconcluso.",
            "headers": {
              "Cache-Control": {
                "schema": {
                  "type": "string"
                },
                "description": "private, no-store"
              },
              "Vary": {
                "schema": {
                  "type": "string"
                },
                "description": "Authorization"
              }
            },
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorFueraDeRecibo"
                }
              }
            }
          },
          "409": {
            "description": "Error fuera de recibo; resultado inconcluso.",
            "headers": {
              "Cache-Control": {
                "schema": {
                  "type": "string"
                },
                "description": "private, no-store"
              },
              "Vary": {
                "schema": {
                  "type": "string"
                },
                "description": "Authorization"
              }
            },
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorFueraDeRecibo"
                }
              }
            }
          },
          "422": {
            "description": "Error fuera de recibo; resultado inconcluso.",
            "headers": {
              "Cache-Control": {
                "schema": {
                  "type": "string"
                },
                "description": "private, no-store"
              },
              "Vary": {
                "schema": {
                  "type": "string"
                },
                "description": "Authorization"
              }
            },
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorFueraDeRecibo"
                }
              }
            }
          },
          "503": {
            "description": "Error fuera de recibo; resultado inconcluso.",
            "headers": {
              "Cache-Control": {
                "schema": {
                  "type": "string"
                },
                "description": "private, no-store"
              },
              "Vary": {
                "schema": {
                  "type": "string"
                },
                "description": "Authorization"
              }
            },
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorFueraDeRecibo"
                }
              }
            }
          }
        }
      }
    },
    "/api/v1/participacion/cargas/{carga_id}/preview": {
      "get": {
        "summary": "Preview propio de cinco minutos",
        "operationId": "Previewpropiodecincominutos",
        "security": [
          {
            "bearerAuth": []
          }
        ],
        "parameters": [
          {
            "name": "carga_id",
            "in": "path",
            "required": true,
            "schema": {
              "$ref": "#/components/schemas/ComandoId"
            }
          }
        ],
        "responses": {
          "200": {
            "description": "Lectura privada.",
            "headers": {
              "Cache-Control": {
                "schema": {
                  "type": "string"
                },
                "description": "private, no-store"
              },
              "Vary": {
                "schema": {
                  "type": "string"
                },
                "description": "Authorization"
              }
            },
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PreviewLectura"
                }
              }
            }
          },
          "401": {
            "description": "Error fuera de recibo; resultado inconcluso.",
            "headers": {
              "Cache-Control": {
                "schema": {
                  "type": "string"
                },
                "description": "private, no-store"
              },
              "Vary": {
                "schema": {
                  "type": "string"
                },
                "description": "Authorization"
              }
            },
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorFueraDeRecibo"
                }
              }
            }
          },
          "403": {
            "description": "Error fuera de recibo; resultado inconcluso.",
            "headers": {
              "Cache-Control": {
                "schema": {
                  "type": "string"
                },
                "description": "private, no-store"
              },
              "Vary": {
                "schema": {
                  "type": "string"
                },
                "description": "Authorization"
              }
            },
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorFueraDeRecibo"
                }
              }
            }
          },
          "404": {
            "description": "Error fuera de recibo; resultado inconcluso.",
            "headers": {
              "Cache-Control": {
                "schema": {
                  "type": "string"
                },
                "description": "private, no-store"
              },
              "Vary": {
                "schema": {
                  "type": "string"
                },
                "description": "Authorization"
              }
            },
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorFueraDeRecibo"
                }
              }
            }
          },
          "409": {
            "description": "Error fuera de recibo; resultado inconcluso.",
            "headers": {
              "Cache-Control": {
                "schema": {
                  "type": "string"
                },
                "description": "private, no-store"
              },
              "Vary": {
                "schema": {
                  "type": "string"
                },
                "description": "Authorization"
              }
            },
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorFueraDeRecibo"
                }
              }
            }
          },
          "422": {
            "description": "Error fuera de recibo; resultado inconcluso.",
            "headers": {
              "Cache-Control": {
                "schema": {
                  "type": "string"
                },
                "description": "private, no-store"
              },
              "Vary": {
                "schema": {
                  "type": "string"
                },
                "description": "Authorization"
              }
            },
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorFueraDeRecibo"
                }
              }
            }
          },
          "503": {
            "description": "Error fuera de recibo; resultado inconcluso.",
            "headers": {
              "Cache-Control": {
                "schema": {
                  "type": "string"
                },
                "description": "private, no-store"
              },
              "Vary": {
                "schema": {
                  "type": "string"
                },
                "description": "Authorization"
              }
            },
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorFueraDeRecibo"
                }
              }
            }
          }
        }
      }
    },
    "/api/v1/impact/fotos/{evidencia_id}": {
      "get": {
        "summary": "Foto pública sanitizada vinculada",
        "operationId": "Fotopblicasanitizadavinculada",
        "security": [],
        "parameters": [
          {
            "name": "evidencia_id",
            "in": "path",
            "required": true,
            "schema": {
              "$ref": "#/components/schemas/Id"
            }
          }
        ],
        "responses": {
          "200": {
            "description": "Lectura privada.",
            "headers": {
              "Cache-Control": {
                "schema": {
                  "type": "string"
                },
                "description": "no-store; URL del derivado válida por cinco minutos."
              }
            },
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PreviewLectura"
                }
              }
            }
          },
          "401": {
            "description": "Error fuera de recibo; resultado inconcluso.",
            "headers": {
              "Cache-Control": {
                "schema": {
                  "type": "string"
                },
                "description": "private, no-store"
              },
              "Vary": {
                "schema": {
                  "type": "string"
                },
                "description": "Authorization"
              }
            },
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorFueraDeRecibo"
                }
              }
            }
          },
          "403": {
            "description": "Error fuera de recibo; resultado inconcluso.",
            "headers": {
              "Cache-Control": {
                "schema": {
                  "type": "string"
                },
                "description": "private, no-store"
              },
              "Vary": {
                "schema": {
                  "type": "string"
                },
                "description": "Authorization"
              }
            },
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorFueraDeRecibo"
                }
              }
            }
          },
          "404": {
            "description": "Error fuera de recibo; resultado inconcluso.",
            "headers": {
              "Cache-Control": {
                "schema": {
                  "type": "string"
                },
                "description": "private, no-store"
              },
              "Vary": {
                "schema": {
                  "type": "string"
                },
                "description": "Authorization"
              }
            },
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorFueraDeRecibo"
                }
              }
            }
          },
          "409": {
            "description": "Error fuera de recibo; resultado inconcluso.",
            "headers": {
              "Cache-Control": {
                "schema": {
                  "type": "string"
                },
                "description": "private, no-store"
              },
              "Vary": {
                "schema": {
                  "type": "string"
                },
                "description": "Authorization"
              }
            },
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorFueraDeRecibo"
                }
              }
            }
          },
          "422": {
            "description": "Error fuera de recibo; resultado inconcluso.",
            "headers": {
              "Cache-Control": {
                "schema": {
                  "type": "string"
                },
                "description": "private, no-store"
              },
              "Vary": {
                "schema": {
                  "type": "string"
                },
                "description": "Authorization"
              }
            },
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorFueraDeRecibo"
                }
              }
            }
          },
          "503": {
            "description": "Error fuera de recibo; resultado inconcluso.",
            "headers": {
              "Cache-Control": {
                "schema": {
                  "type": "string"
                },
                "description": "private, no-store"
              },
              "Vary": {
                "schema": {
                  "type": "string"
                },
                "description": "Authorization"
              }
            },
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorFueraDeRecibo"
                }
              }
            }
          }
        }
      }
    }
  },
  "components": {
    "schemas": {
      "Id": {
        "type": "string",
        "pattern": "^[1-9][0-9]*$",
        "maxLength": 19,
        "description": "Decimal canónico positivo hasta 9223372036854775807; nunca JSON number."
      },
      "Revision": {
        "type": "string",
        "pattern": "^(0|[1-9][0-9]*)$",
        "maxLength": 19,
        "description": "Decimal canónico 0..9223372036854775807."
      },
      "ComandoId": {
        "type": "string",
        "format": "uuid",
        "pattern": "^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"
      },
      "ErrorEstable": {
        "type": "object",
        "additionalProperties": false,
        "properties": {
          "codigo": {
            "type": "string"
          },
          "mensaje": {
            "type": "string"
          },
          "campos": {
            "type": "array",
            "items": {
              "type": "string"
            }
          },
          "ambitos": {
            "type": "array",
            "items": {
              "$ref": "#/components/schemas/Id"
            }
          },
          "reintento": {
            "type": "string",
            "enum": [
              "MISMA_CLAVE",
              "NUEVA_CONFIRMACION",
              "RECUPERAR_SESION",
              "NO_APLICA"
            ]
          }
        },
        "required": [
          "codigo",
          "mensaje",
          "campos",
          "ambitos",
          "reintento"
        ]
      },
      "ErrorFueraDeRecibo": {
        "type": "object",
        "additionalProperties": false,
        "properties": {
          "error": {
            "$ref": "#/components/schemas/ErrorEstable"
          },
          "comando_id": {
            "type": "string",
            "format": "uuid",
            "nullable": true
          },
          "resultado_concluyente": {
            "type": "boolean",
            "enum": [
              false
            ]
          }
        },
        "required": [
          "error",
          "comando_id",
          "resultado_concluyente"
        ]
      },
      "PersonaMinima": {
        "type": "object",
        "additionalProperties": false,
        "properties": {
          "usuario_id": {
            "$ref": "#/components/schemas/Id"
          },
          "nombre": {
            "type": "string"
          },
          "organizacion": {
            "type": "string",
            "nullable": true
          }
        },
        "required": [
          "usuario_id",
          "nombre",
          "organizacion"
        ]
      },
      "AmbitoRevision": {
        "type": "object",
        "additionalProperties": false,
        "properties": {
          "subcampania_id": {
            "$ref": "#/components/schemas/Id"
          },
          "revision_esperada": {
            "$ref": "#/components/schemas/Revision"
          }
        },
        "required": [
          "subcampania_id",
          "revision_esperada"
        ]
      },
      "AmbitoReemplazo": {
        "type": "object",
        "additionalProperties": false,
        "properties": {
          "subcampania_id": {
            "$ref": "#/components/schemas/Id"
          },
          "revision_saliente_esperada": {
            "$ref": "#/components/schemas/Revision"
          },
          "revision_reemplazo_esperada": {
            "$ref": "#/components/schemas/Revision"
          }
        },
        "required": [
          "subcampania_id",
          "revision_saliente_esperada",
          "revision_reemplazo_esperada"
        ]
      },
      "AccesoEntrada": {
        "type": "object",
        "additionalProperties": false,
        "properties": {
          "comando_id": {
            "$ref": "#/components/schemas/ComandoId"
          },
          "usuario_destino_id": {
            "$ref": "#/components/schemas/Id"
          },
          "ambitos": {
            "type": "array",
            "items": {
              "$ref": "#/components/schemas/AmbitoRevision"
            },
            "minItems": 1,
            "maxItems": 100
          }
        },
        "required": [
          "comando_id",
          "usuario_destino_id",
          "ambitos"
        ]
      },
      "ReemplazoEntrada": {
        "type": "object",
        "additionalProperties": false,
        "properties": {
          "comando_id": {
            "$ref": "#/components/schemas/ComandoId"
          },
          "usuario_saliente_id": {
            "$ref": "#/components/schemas/Id"
          },
          "usuario_reemplazo_id": {
            "$ref": "#/components/schemas/Id"
          },
          "tratamiento_saliente": {
            "type": "string",
            "enum": [
              "PLANTADOR",
              "SIN_ACCESO"
            ]
          },
          "ambitos": {
            "type": "array",
            "items": {
              "$ref": "#/components/schemas/AmbitoReemplazo"
            },
            "minItems": 1,
            "maxItems": 100
          }
        },
        "required": [
          "comando_id",
          "usuario_saliente_id",
          "usuario_reemplazo_id",
          "tratamiento_saliente",
          "ambitos"
        ]
      },
      "RolesEntrada": {
        "type": "object",
        "additionalProperties": false,
        "properties": {
          "comando_id": {
            "$ref": "#/components/schemas/ComandoId"
          },
          "rol_global": {
            "type": "string",
            "enum": [
              "ADMIN",
              "GENERAL",
              "VALIDADOR",
              "VOLUNTARIO"
            ]
          },
          "revision_esperada": {
            "$ref": "#/components/schemas/Revision"
          },
          "motivo": {
            "type": "string",
            "minLength": 3,
            "maxLength": 1000,
            "description": "NFC y trim; se conservan espacios interiores."
          }
        },
        "required": [
          "comando_id",
          "rol_global",
          "revision_esperada",
          "motivo"
        ]
      },
      "InactivacionEntrada": {
        "type": "object",
        "additionalProperties": false,
        "properties": {
          "comando_id": {
            "$ref": "#/components/schemas/ComandoId"
          },
          "revision_esperada": {
            "$ref": "#/components/schemas/Revision"
          },
          "motivo": {
            "type": "string",
            "minLength": 3,
            "maxLength": 1000
          }
        },
        "required": [
          "comando_id",
          "revision_esperada",
          "motivo"
        ]
      },
      "BuscarEntrada": {
        "oneOf": [
          {
            "type": "object",
            "additionalProperties": false,
            "properties": {
              "modo": {
                "type": "string",
                "enum": [
                  "NOMBRE"
                ]
              },
              "consulta": {
                "type": "string",
                "minLength": 2,
                "maxLength": 100
              },
              "accion": {
                "type": "string",
                "enum": [
                  "OTORGAR_PLANTADOR",
                  "DESIGNAR_ADMINISTRADOR",
                  "REEMPLAZAR_ADMINISTRADOR"
                ]
              },
              "subcampania_ids": {
                "type": "array",
                "items": {
                  "$ref": "#/components/schemas/Id"
                },
                "minItems": 1,
                "maxItems": 100,
                "uniqueItems": true
              },
              "cursor": {
                "type": "string",
                "minLength": 1,
                "maxLength": 1024
              },
              "limite": {
                "type": "integer",
                "minimum": 1,
                "maximum": 20,
                "default": 20
              }
            },
            "required": [
              "modo",
              "consulta",
              "accion",
              "subcampania_ids"
            ]
          },
          {
            "type": "object",
            "additionalProperties": false,
            "properties": {
              "modo": {
                "type": "string",
                "enum": [
                  "CORREO_EXACTO"
                ]
              },
              "consulta": {
                "type": "string",
                "minLength": 1,
                "maxLength": 254
              },
              "accion": {
                "type": "string",
                "enum": [
                  "OTORGAR_PLANTADOR",
                  "DESIGNAR_ADMINISTRADOR",
                  "REEMPLAZAR_ADMINISTRADOR"
                ]
              },
              "subcampania_ids": {
                "type": "array",
                "items": {
                  "$ref": "#/components/schemas/Id"
                },
                "minItems": 1,
                "maxItems": 100,
                "uniqueItems": true
              },
              "cursor": {
                "type": "string",
                "minLength": 1,
                "maxLength": 1024
              },
              "limite": {
                "type": "integer",
                "minimum": 1,
                "maximum": 20,
                "default": 20
              }
            },
            "required": [
              "modo",
              "consulta",
              "accion",
              "subcampania_ids"
            ]
          }
        ]
      },
      "RevisarEntrada": {
        "type": "object",
        "additionalProperties": false,
        "properties": {
          "usuario_destino_id": {
            "$ref": "#/components/schemas/Id"
          },
          "subcampania_ids": {
            "type": "array",
            "items": {
              "$ref": "#/components/schemas/Id"
            },
            "minItems": 1,
            "maxItems": 100,
            "uniqueItems": true
          }
        },
        "required": [
          "usuario_destino_id",
          "subcampania_ids"
        ]
      },
      "Miembro": {
        "type": "object",
        "additionalProperties": false,
        "properties": {
          "usuario_id": {
            "$ref": "#/components/schemas/Id"
          },
          "nombre": {
            "type": "string"
          },
          "organizacion": {
            "type": "string",
            "nullable": true
          },
          "permiso_contextual": {
            "type": "string",
            "nullable": true,
            "enum": [
              "PLANTADOR",
              "ADMINISTRADOR_SUBCAMPANIA",
              null
            ]
          },
          "revision_permiso": {
            "$ref": "#/components/schemas/Revision"
          },
          "acceso_global": {
            "type": "boolean"
          },
          "etiqueta_acceso_global": {
            "type": "string",
            "nullable": true,
            "enum": [
              "Administrador · Acceso global",
              null
            ]
          },
          "responsabilidad_logistica": {
            "type": "string",
            "nullable": true,
            "enum": [
              "COORDINADOR",
              "OPERARIO",
              null
            ]
          }
        },
        "required": [
          "usuario_id",
          "nombre",
          "organizacion",
          "permiso_contextual",
          "revision_permiso",
          "acceso_global",
          "etiqueta_acceso_global",
          "responsabilidad_logistica"
        ]
      },
      "Acciones": {
        "type": "object",
        "additionalProperties": false,
        "properties": {
          "preparar_registro": {
            "type": "boolean"
          },
          "registrar_inicial": {
            "type": "boolean"
          },
          "incorporar_plantador": {
            "type": "boolean"
          },
          "retirar_plantador": {
            "type": "boolean"
          },
          "designar_administrador": {
            "type": "boolean"
          },
          "cambiar_administrador": {
            "type": "boolean"
          },
          "retirar_administrador": {
            "type": "boolean"
          },
          "reemplazar_administrador": {
            "type": "boolean"
          }
        },
        "required": [
          "preparar_registro",
          "registrar_inicial",
          "incorporar_plantador",
          "retirar_plantador",
          "designar_administrador",
          "cambiar_administrador",
          "retirar_administrador",
          "reemplazar_administrador"
        ]
      },
      "CapacidadSubcampania": {
        "type": "object",
        "additionalProperties": false,
        "properties": {
          "campania_id": {
            "$ref": "#/components/schemas/Id"
          },
          "campania_nombre": {
            "type": "string"
          },
          "subcampania_id": {
            "$ref": "#/components/schemas/Id"
          },
          "nombre": {
            "type": "string"
          },
          "estado": {
            "type": "string",
            "enum": [
              "BORRADOR",
              "ACTIVA",
              "COMPLETADA",
              "FINALIZADA_PARCIAL",
              "PAUSADA",
              "CANCELADA"
            ]
          },
          "permiso_contextual": {
            "type": "string",
            "nullable": true,
            "enum": [
              "PLANTADOR",
              "ADMINISTRADOR_SUBCAMPANIA",
              null
            ]
          },
          "revision_permiso": {
            "$ref": "#/components/schemas/Revision"
          },
          "fuente_autoridad": {
            "type": "string",
            "enum": [
              "GLOBAL",
              "CONTEXTUAL"
            ]
          },
          "acciones": {
            "$ref": "#/components/schemas/Acciones"
          }
        },
        "required": [
          "campania_id",
          "campania_nombre",
          "subcampania_id",
          "nombre",
          "estado",
          "permiso_contextual",
          "revision_permiso",
          "fuente_autoridad",
          "acciones"
        ]
      },
      "Capacidades": {
        "type": "object",
        "additionalProperties": false,
        "properties": {
          "actor": {
            "type": "object",
            "additionalProperties": false,
            "properties": {
              "usuario_id": {
                "$ref": "#/components/schemas/Id"
              },
              "rol_global": {
                "type": "string",
                "enum": [
                  "ADMIN",
                  "GENERAL",
                  "VALIDADOR",
                  "VOLUNTARIO"
                ]
              }
            },
            "required": [
              "usuario_id",
              "rol_global"
            ]
          },
          "capacidades_globales": {
            "type": "object",
            "additionalProperties": false,
            "properties": {
              "asignar_roles": {
                "type": "boolean"
              },
              "designar_administradores": {
                "type": "boolean"
              },
              "leer_plan": {
                "type": "boolean"
              }
            },
            "required": [
              "asignar_roles",
              "designar_administradores",
              "leer_plan"
            ]
          },
          "subcampanias": {
            "type": "array",
            "items": {
              "$ref": "#/components/schemas/CapacidadSubcampania"
            }
          }
        },
        "required": [
          "actor",
          "capacidades_globales",
          "subcampanias"
        ]
      },
      "RevisionAmbito": {
        "type": "object",
        "additionalProperties": false,
        "properties": {
          "subcampania_id": {
            "$ref": "#/components/schemas/Id"
          },
          "permiso_contextual": {
            "type": "string",
            "nullable": true,
            "enum": [
              "PLANTADOR",
              "ADMINISTRADOR_SUBCAMPANIA",
              null
            ]
          },
          "revision_permiso": {
            "$ref": "#/components/schemas/Revision"
          },
          "acceso_global": {
            "type": "boolean"
          }
        },
        "required": [
          "subcampania_id",
          "permiso_contextual",
          "revision_permiso",
          "acceso_global"
        ]
      },
      "RevisionAccesos": {
        "type": "object",
        "additionalProperties": false,
        "properties": {
          "usuario": {
            "$ref": "#/components/schemas/PersonaMinima"
          },
          "ambitos": {
            "type": "array",
            "items": {
              "$ref": "#/components/schemas/RevisionAmbito"
            },
            "minItems": 1,
            "maxItems": 100
          }
        },
        "required": [
          "usuario",
          "ambitos"
        ]
      },
      "Autoridad": {
        "type": "object",
        "additionalProperties": false,
        "properties": {
          "usuario_id": {
            "$ref": "#/components/schemas/Id"
          },
          "nombre": {
            "type": "string"
          },
          "rol_global": {
            "type": "string",
            "enum": [
              "ADMIN",
              "GENERAL",
              "VALIDADOR",
              "VOLUNTARIO"
            ]
          },
          "activo": {
            "type": "boolean"
          },
          "revision_autoridad": {
            "$ref": "#/components/schemas/Revision"
          }
        },
        "required": [
          "usuario_id",
          "nombre",
          "rol_global",
          "activo",
          "revision_autoridad"
        ]
      },
      "CambioUsuario": {
        "type": "object",
        "additionalProperties": false,
        "properties": {
          "usuario_id": {
            "$ref": "#/components/schemas/Id"
          },
          "permiso_anterior": {
            "type": "string",
            "nullable": true,
            "enum": [
              "PLANTADOR",
              "ADMINISTRADOR_SUBCAMPANIA",
              null
            ]
          },
          "permiso_nuevo": {
            "type": "string",
            "nullable": true,
            "enum": [
              "PLANTADOR",
              "ADMINISTRADOR_SUBCAMPANIA",
              null
            ]
          },
          "revision_anterior": {
            "$ref": "#/components/schemas/Revision"
          },
          "revision_nueva": {
            "$ref": "#/components/schemas/Revision"
          },
          "cambio": {
            "type": "string",
            "enum": [
              "CAMBIO_APLICADO",
              "SIN_CAMBIOS"
            ]
          },
          "conserva_acceso_global": {
            "type": "boolean"
          }
        },
        "required": [
          "usuario_id",
          "permiso_anterior",
          "permiso_nuevo",
          "revision_anterior",
          "revision_nueva",
          "cambio",
          "conserva_acceso_global"
        ]
      },
      "AccesoResultado": {
        "type": "object",
        "additionalProperties": false,
        "properties": {
          "tipo": {
            "type": "string",
            "enum": [
              "ACCESO"
            ]
          },
          "cambios": {
            "type": "array",
            "items": {
              "type": "object",
              "additionalProperties": false,
              "properties": {
                "subcampania_id": {
                  "$ref": "#/components/schemas/Id"
                },
                "usuarios": {
                  "type": "array",
                  "items": {
                    "$ref": "#/components/schemas/CambioUsuario"
                  },
                  "minItems": 1,
                  "maxItems": 2
                }
              },
              "required": [
                "subcampania_id",
                "usuarios"
              ]
            },
            "minItems": 1,
            "maxItems": 100
          }
        },
        "required": [
          "tipo",
          "cambios"
        ]
      },
      "RolResultado": {
        "type": "object",
        "additionalProperties": false,
        "properties": {
          "tipo": {
            "type": "string",
            "enum": [
              "ROL_GLOBAL"
            ]
          },
          "usuario_id": {
            "$ref": "#/components/schemas/Id"
          },
          "rol_anterior": {
            "type": "string",
            "enum": [
              "ADMIN",
              "GENERAL",
              "VALIDADOR",
              "VOLUNTARIO"
            ]
          },
          "rol_nuevo": {
            "type": "string",
            "enum": [
              "ADMIN",
              "GENERAL",
              "VALIDADOR",
              "VOLUNTARIO"
            ]
          },
          "revision_anterior": {
            "$ref": "#/components/schemas/Revision"
          },
          "revision_nueva": {
            "$ref": "#/components/schemas/Revision"
          },
          "cambio": {
            "type": "string",
            "enum": [
              "CAMBIO_APLICADO",
              "SIN_CAMBIOS"
            ]
          }
        },
        "required": [
          "tipo",
          "usuario_id",
          "rol_anterior",
          "rol_nuevo",
          "revision_anterior",
          "revision_nueva",
          "cambio"
        ]
      },
      "InactivacionResultado": {
        "type": "object",
        "additionalProperties": false,
        "properties": {
          "tipo": {
            "type": "string",
            "enum": [
              "CUENTA_INACTIVADA"
            ]
          },
          "usuario_id": {
            "$ref": "#/components/schemas/Id"
          },
          "activo": {
            "type": "boolean",
            "enum": [
              false
            ]
          },
          "revision_anterior": {
            "$ref": "#/components/schemas/Revision"
          },
          "revision_nueva": {
            "$ref": "#/components/schemas/Revision"
          },
          "cambio": {
            "type": "string",
            "enum": [
              "CAMBIO_APLICADO",
              "SIN_CAMBIOS"
            ]
          }
        },
        "required": [
          "tipo",
          "usuario_id",
          "activo",
          "revision_anterior",
          "revision_nueva",
          "cambio"
        ]
      },
      "PlantacionResultado": {
        "type": "object",
        "additionalProperties": false,
        "properties": {
          "tipo": {
            "type": "string",
            "enum": [
              "PLANTACION_INICIAL"
            ]
          },
          "registro_plantacion_id": {
            "$ref": "#/components/schemas/Id"
          },
          "codigo_trazabilidad": {
            "type": "string"
          },
          "subcampania_id": {
            "$ref": "#/components/schemas/Id"
          },
          "responsable_id": {
            "$ref": "#/components/schemas/Id"
          },
          "fecha_plantacion": {
            "type": "string",
            "format": "date"
          },
          "cantidad_total_plantada": {
            "type": "integer",
            "minimum": 1,
            "maximum": 2147483647
          },
          "especies": {
            "type": "array",
            "items": {
              "type": "object",
              "additionalProperties": false,
              "properties": {
                "planta_id": {
                  "$ref": "#/components/schemas/Id"
                },
                "cantidad": {
                  "type": "integer",
                  "minimum": 1,
                  "maximum": 2147483647
                }
              },
              "required": [
                "planta_id",
                "cantidad"
              ]
            }
          },
          "gps_dentro_poligono": {
            "type": "boolean"
          },
          "gps_distancia_a_poligono_m": {
            "type": "number",
            "nullable": true
          },
          "revision_inicial": {
            "type": "string",
            "enum": [
              "0"
            ]
          }
        },
        "required": [
          "tipo",
          "registro_plantacion_id",
          "codigo_trazabilidad",
          "subcampania_id",
          "responsable_id",
          "fecha_plantacion",
          "cantidad_total_plantada",
          "especies",
          "gps_dentro_poligono",
          "gps_distancia_a_poligono_m",
          "revision_inicial"
        ]
      },
      "Confirmado": {
        "type": "object",
        "additionalProperties": false,
        "properties": {
          "comando_id": {
            "$ref": "#/components/schemas/ComandoId"
          },
          "operacion": {
            "type": "string",
            "enum": [
              "OTORGAR_PLANTADOR",
              "RETIRAR_PLANTADOR",
              "DESIGNAR_ADMINISTRADOR",
              "CAMBIAR_ADMINISTRADOR_A_PLANTADOR",
              "RETIRAR_ADMINISTRADOR",
              "REEMPLAZAR_ADMINISTRADOR",
              "CAMBIAR_ROL_GLOBAL",
              "INACTIVAR_CUENTA",
              "REGISTRAR_PLANTACION_INICIAL"
            ]
          },
          "finalizado_en": {
            "type": "string",
            "format": "date-time",
            "pattern": "Z$"
          },
          "estado": {
            "type": "string",
            "enum": [
              "CONFIRMADO"
            ]
          },
          "resultado": {
            "oneOf": [
              {
                "$ref": "#/components/schemas/AccesoResultado"
              },
              {
                "$ref": "#/components/schemas/RolResultado"
              },
              {
                "$ref": "#/components/schemas/InactivacionResultado"
              },
              {
                "$ref": "#/components/schemas/PlantacionResultado"
              }
            ]
          },
          "error": {
            "type": "object",
            "nullable": true,
            "enum": [
              null
            ]
          }
        },
        "required": [
          "comando_id",
          "operacion",
          "finalizado_en",
          "estado",
          "resultado",
          "error"
        ]
      },
      "Rechazado": {
        "type": "object",
        "additionalProperties": false,
        "properties": {
          "comando_id": {
            "$ref": "#/components/schemas/ComandoId"
          },
          "operacion": {
            "type": "string",
            "enum": [
              "OTORGAR_PLANTADOR",
              "RETIRAR_PLANTADOR",
              "DESIGNAR_ADMINISTRADOR",
              "CAMBIAR_ADMINISTRADOR_A_PLANTADOR",
              "RETIRAR_ADMINISTRADOR",
              "REEMPLAZAR_ADMINISTRADOR",
              "CAMBIAR_ROL_GLOBAL",
              "INACTIVAR_CUENTA",
              "REGISTRAR_PLANTACION_INICIAL"
            ]
          },
          "finalizado_en": {
            "type": "string",
            "format": "date-time",
            "pattern": "Z$"
          },
          "estado": {
            "type": "string",
            "enum": [
              "RECHAZADO"
            ]
          },
          "resultado": {
            "type": "object",
            "nullable": true,
            "enum": [
              null
            ]
          },
          "error": {
            "$ref": "#/components/schemas/ErrorEstable"
          }
        },
        "required": [
          "comando_id",
          "operacion",
          "finalizado_en",
          "estado",
          "resultado",
          "error"
        ]
      },
      "SinResultado": {
        "type": "object",
        "additionalProperties": false,
        "properties": {
          "comando_id": {
            "$ref": "#/components/schemas/ComandoId"
          },
          "operacion": {
            "type": "string",
            "enum": [
              "REGISTRAR_PLANTACION_INICIAL"
            ]
          },
          "estado": {
            "type": "string",
            "enum": [
              "SIN_RESULTADO"
            ]
          },
          "resultado": {
            "type": "object",
            "nullable": true,
            "enum": [
              null
            ]
          },
          "error": {
            "type": "object",
            "nullable": true,
            "enum": [
              null
            ]
          },
          "finalizado_en": {
            "type": "string",
            "nullable": true,
            "enum": [
              null
            ]
          }
        },
        "required": [
          "comando_id",
          "operacion",
          "estado",
          "resultado",
          "error",
          "finalizado_en"
        ]
      },
      "Recibo": {
        "oneOf": [
          {
            "$ref": "#/components/schemas/Confirmado"
          },
          {
            "$ref": "#/components/schemas/Rechazado"
          }
        ]
      },
      "CapacidadesLectura": {
        "type": "object",
        "additionalProperties": false,
        "properties": {
          "data": {
            "$ref": "#/components/schemas/Capacidades"
          },
          "observado_en": {
            "type": "string",
            "format": "date-time",
            "pattern": "Z$"
          },
          "siguiente_cursor": {
            "type": "string",
            "nullable": true
          }
        },
        "required": [
          "data",
          "observado_en",
          "siguiente_cursor"
        ]
      },
      "MiembrosLectura": {
        "type": "object",
        "additionalProperties": false,
        "properties": {
          "data": {
            "type": "array",
            "items": {
              "$ref": "#/components/schemas/Miembro"
            }
          },
          "observado_en": {
            "type": "string",
            "format": "date-time",
            "pattern": "Z$"
          },
          "siguiente_cursor": {
            "type": "string",
            "nullable": true
          }
        },
        "required": [
          "data",
          "observado_en",
          "siguiente_cursor"
        ]
      },
      "PersonasLectura": {
        "type": "object",
        "additionalProperties": false,
        "properties": {
          "data": {
            "type": "array",
            "items": {
              "$ref": "#/components/schemas/PersonaMinima"
            }
          },
          "observado_en": {
            "type": "string",
            "format": "date-time",
            "pattern": "Z$"
          },
          "siguiente_cursor": {
            "type": "string",
            "nullable": true
          }
        },
        "required": [
          "data",
          "observado_en",
          "siguiente_cursor"
        ]
      },
      "RevisionLectura": {
        "type": "object",
        "additionalProperties": false,
        "properties": {
          "data": {
            "$ref": "#/components/schemas/RevisionAccesos"
          },
          "observado_en": {
            "type": "string",
            "format": "date-time",
            "pattern": "Z$"
          }
        },
        "required": [
          "data",
          "observado_en"
        ]
      },
      "AutoridadLectura": {
        "type": "object",
        "additionalProperties": false,
        "properties": {
          "data": {
            "$ref": "#/components/schemas/Autoridad"
          },
          "observado_en": {
            "type": "string",
            "format": "date-time",
            "pattern": "Z$"
          }
        },
        "required": [
          "data",
          "observado_en"
        ]
      },
      "ReciboOError": {
        "oneOf": [
          {
            "$ref": "#/components/schemas/Rechazado"
          },
          {
            "$ref": "#/components/schemas/ErrorFueraDeRecibo"
          }
        ]
      },
      "RegistroInicialEntrada": {
        "type": "object",
        "additionalProperties": false,
        "properties": {
          "comando_id": {
            "$ref": "#/components/schemas/ComandoId"
          },
          "subcampania_id": {
            "$ref": "#/components/schemas/Id"
          },
          "plan_revision_esperada": {
            "$ref": "#/components/schemas/Revision"
          },
          "fecha_plantacion": {
            "type": "string",
            "format": "date",
            "pattern": "^\\d{4}-\\d{2}-\\d{2}$"
          },
          "latitud": {
            "type": "number",
            "minimum": -90,
            "maximum": 90,
            "multipleOf": 0.000001
          },
          "longitud": {
            "type": "number",
            "minimum": -180,
            "maximum": 180,
            "multipleOf": 0.000001
          },
          "especies": {
            "type": "array",
            "items": {
              "type": "object",
              "additionalProperties": false,
              "properties": {
                "planta_id": {
                  "$ref": "#/components/schemas/Id"
                },
                "cantidad": {
                  "type": "integer",
                  "minimum": 1,
                  "maximum": 2147483647
                }
              },
              "required": [
                "planta_id",
                "cantidad"
              ]
            },
            "minItems": 1,
            "maxItems": 100
          },
          "coresponsable_ids": {
            "type": "array",
            "items": {
              "$ref": "#/components/schemas/Id"
            },
            "minItems": 0,
            "maxItems": 100,
            "uniqueItems": true
          },
          "evidencia_ids": {
            "type": "array",
            "items": {
              "$ref": "#/components/schemas/Id"
            },
            "minItems": 1,
            "maxItems": 10,
            "uniqueItems": true
          },
          "observaciones": {
            "type": "string",
            "nullable": true,
            "maxLength": 2000,
            "description": "NFC/trim; omitido, vacío y null equivalen a null."
          },
          "afiliaciones_declaradas": {
            "type": "array",
            "items": {
              "type": "object",
              "additionalProperties": false,
              "properties": {
                "usuario_id": {
                  "$ref": "#/components/schemas/Id"
                },
                "afiliacion": {
                  "oneOf": [
                    {
                      "type": "object",
                      "additionalProperties": false,
                      "properties": {
                        "tipo": {
                          "type": "string",
                          "enum": [
                            "ORGANIZACION_REGISTRADA"
                          ]
                        },
                        "organizacion_id": {
                          "$ref": "#/components/schemas/Id"
                        }
                      },
                      "required": [
                        "tipo",
                        "organizacion_id"
                      ]
                    },
                    {
                      "type": "object",
                      "additionalProperties": false,
                      "properties": {
                        "tipo": {
                          "type": "string",
                          "enum": [
                            "OTRA"
                          ]
                        },
                        "nombre": {
                          "type": "string",
                          "minLength": 1,
                          "maxLength": 150
                        }
                      },
                      "required": [
                        "tipo",
                        "nombre"
                      ]
                    },
                    {
                      "type": "object",
                      "nullable": true,
                      "enum": [
                        null
                      ]
                    }
                  ]
                }
              },
              "required": [
                "usuario_id",
                "afiliacion"
              ]
            },
            "minItems": 0,
            "maxItems": 101
          }
        },
        "required": [
          "comando_id",
          "subcampania_id",
          "plan_revision_esperada",
          "fecha_plantacion",
          "latitud",
          "longitud",
          "especies",
          "coresponsable_ids",
          "evidencia_ids"
        ]
      },
      "ContextoRegistro": {
        "type": "object",
        "additionalProperties": false,
        "properties": {
          "subcampania": {
            "type": "object",
            "additionalProperties": false,
            "properties": {
              "id": {
                "$ref": "#/components/schemas/Id"
              },
              "campania_id": {
                "$ref": "#/components/schemas/Id"
              },
              "nombre": {
                "type": "string"
              },
              "campania_nombre": {
                "type": "string"
              },
              "estado": {
                "type": "string",
                "enum": [
                  "ACTIVA"
                ]
              },
              "plan_revision": {
                "$ref": "#/components/schemas/Revision"
              },
              "meta_total_arboles": {
                "type": "integer",
                "minimum": 1,
                "maximum": 2147483647
              },
              "poligono": {
                "type": "object",
                "additionalProperties": false,
                "properties": {
                  "type": {
                    "type": "string",
                    "enum": [
                      "Polygon"
                    ]
                  },
                  "coordinates": {
                    "type": "array",
                    "items": {
                      "type": "array",
                      "items": {
                        "type": "array",
                        "items": {
                          "type": "number"
                        },
                        "minItems": 2,
                        "maxItems": 2
                      },
                      "minItems": 4
                    },
                    "minItems": 1
                  }
                },
                "required": [
                  "type",
                  "coordinates"
                ]
              }
            },
            "required": [
              "id",
              "campania_id",
              "nombre",
              "campania_nombre",
              "estado",
              "plan_revision",
              "meta_total_arboles",
              "poligono"
            ]
          },
          "actor": {
            "type": "object",
            "additionalProperties": false,
            "properties": {
              "usuario_id": {
                "$ref": "#/components/schemas/Id"
              },
              "fuente_autoridad": {
                "type": "string",
                "enum": [
                  "GLOBAL",
                  "CONTEXTUAL"
                ]
              }
            },
            "required": [
              "usuario_id",
              "fuente_autoridad"
            ]
          },
          "disponibilidad": {
            "type": "string",
            "enum": [
              "DISPONIBLE",
              "SIN_STOCK"
            ]
          },
          "especies": {
            "type": "array",
            "items": {
              "type": "object",
              "additionalProperties": false,
              "properties": {
                "planta_id": {
                  "$ref": "#/components/schemas/Id"
                },
                "nombre": {
                  "type": "string"
                },
                "porcentaje_objetivo": {
                  "type": "number",
                  "minimum": 0,
                  "maximum": 100
                },
                "cantidad_objetivo": {
                  "type": "integer",
                  "minimum": 0,
                  "maximum": 2147483647
                },
                "saldo_elegible": {
                  "type": "integer",
                  "minimum": 0,
                  "maximum": 2147483647
                }
              },
              "required": [
                "planta_id",
                "nombre",
                "porcentaje_objetivo",
                "cantidad_objetivo",
                "saldo_elegible"
              ]
            },
            "minItems": 1,
            "maxItems": 100
          },
          "reglas": {
            "type": "object",
            "additionalProperties": false,
            "properties": {
              "hoy_operativo": {
                "type": "string",
                "format": "date",
                "pattern": "^\\d{4}-\\d{2}-\\d{2}$"
              },
              "fecha_minima_ventana": {
                "type": "string",
                "format": "date",
                "pattern": "^\\d{4}-\\d{2}-\\d{2}$"
              },
              "fecha_maxima": {
                "type": "string",
                "format": "date",
                "pattern": "^\\d{4}-\\d{2}-\\d{2}$"
              },
              "zona_horaria": {
                "type": "string",
                "enum": [
                  "America/La_Paz"
                ]
              },
              "ventana_retroactiva_dias": {
                "type": "integer",
                "enum": [
                  10
                ]
              },
              "fotos_min": {
                "type": "integer",
                "enum": [
                  1
                ]
              },
              "fotos_max": {
                "type": "integer",
                "enum": [
                  10
                ]
              },
              "exterior_permitido": {
                "type": "boolean",
                "enum": [
                  true
                ]
              }
            },
            "required": [
              "hoy_operativo",
              "fecha_minima_ventana",
              "fecha_maxima",
              "zona_horaria",
              "ventana_retroactiva_dias",
              "fotos_min",
              "fotos_max",
              "exterior_permitido"
            ]
          }
        },
        "required": [
          "subcampania",
          "actor",
          "disponibilidad",
          "especies",
          "reglas"
        ]
      },
      "ParticipanteSnapshot": {
        "type": "object",
        "additionalProperties": false,
        "properties": {
          "usuario_id": {
            "$ref": "#/components/schemas/Id"
          },
          "nombre_snapshot": {
            "type": "string",
            "nullable": true
          },
          "afiliacion_snapshot": {
            "type": "string",
            "nullable": true
          },
          "afiliacion_estado": {
            "type": "string",
            "enum": [
              "DECLARADA",
              "NO_DECLARADA",
              "HISTORICA_NO_DISPONIBLE"
            ]
          },
          "afiliacion_tipo": {
            "type": "string",
            "nullable": true,
            "enum": [
              "ORGANIZACION_REGISTRADA",
              "OTRA",
              null
            ]
          },
          "organizacion_id_snapshot": {
            "type": "string",
            "nullable": true,
            "pattern": "^[1-9][0-9]*$",
            "maxLength": 19
          },
          "es_responsable": {
            "type": "boolean"
          }
        },
        "required": [
          "usuario_id",
          "nombre_snapshot",
          "afiliacion_snapshot",
          "afiliacion_estado",
          "afiliacion_tipo",
          "organizacion_id_snapshot",
          "es_responsable"
        ]
      },
      "DetallePropio": {
        "type": "object",
        "additionalProperties": false,
        "properties": {
          "registro_plantacion_id": {
            "$ref": "#/components/schemas/Id"
          },
          "codigo_trazabilidad": {
            "type": "string"
          },
          "subcampania_id": {
            "$ref": "#/components/schemas/Id"
          },
          "fecha_plantacion": {
            "type": "string",
            "format": "date",
            "pattern": "^\\d{4}-\\d{2}-\\d{2}$"
          },
          "revision_registro": {
            "$ref": "#/components/schemas/Revision"
          },
          "relaciones": {
            "type": "array",
            "items": {
              "type": "string",
              "enum": [
                "AUTOR",
                "PARTICIPANTE"
              ]
            },
            "minItems": 1,
            "maxItems": 2,
            "uniqueItems": true
          },
          "cantidad_total_plantada": {
            "type": "integer",
            "minimum": 1,
            "maximum": 2147483647
          },
          "especies": {
            "type": "array",
            "items": {
              "type": "object",
              "additionalProperties": false,
              "properties": {
                "planta_id": {
                  "$ref": "#/components/schemas/Id"
                },
                "cantidad": {
                  "type": "integer",
                  "minimum": 1,
                  "maximum": 2147483647
                }
              },
              "required": [
                "planta_id",
                "cantidad"
              ]
            },
            "minItems": 1,
            "maxItems": 100
          },
          "latitud": {
            "type": "number"
          },
          "longitud": {
            "type": "number"
          },
          "gps_dentro_poligono": {
            "type": "boolean"
          },
          "participantes": {
            "type": "array",
            "items": {
              "$ref": "#/components/schemas/ParticipanteSnapshot"
            },
            "minItems": 1,
            "maxItems": 101
          },
          "evidencia_ids": {
            "type": "array",
            "items": {
              "$ref": "#/components/schemas/Id"
            },
            "minItems": 0,
            "maxItems": 10
          },
          "observaciones_autor": {
            "type": "string",
            "nullable": true
          }
        },
        "required": [
          "registro_plantacion_id",
          "codigo_trazabilidad",
          "subcampania_id",
          "fecha_plantacion",
          "revision_registro",
          "relaciones",
          "cantidad_total_plantada",
          "especies",
          "latitud",
          "longitud",
          "gps_dentro_poligono",
          "participantes",
          "evidencia_ids",
          "observaciones_autor"
        ]
      },
      "PreparacionEntrada": {
        "type": "object",
        "additionalProperties": false,
        "properties": {
          "comando_id": {
            "$ref": "#/components/schemas/ComandoId"
          },
          "operacion": {
            "type": "string",
            "enum": [
              "REGISTRAR_PLANTACION_INICIAL"
            ]
          },
          "subcampania_id": {
            "$ref": "#/components/schemas/Id"
          }
        },
        "required": [
          "comando_id",
          "operacion",
          "subcampania_id"
        ]
      },
      "DescartePreparacionEntrada": {
        "type": "object",
        "additionalProperties": false,
        "properties": {
          "operacion": {
            "type": "string",
            "enum": [
              "REGISTRAR_PLANTACION_INICIAL"
            ]
          }
        },
        "required": [
          "operacion"
        ]
      },
      "Preparacion": {
        "type": "object",
        "additionalProperties": false,
        "properties": {
          "comando_id": {
            "$ref": "#/components/schemas/ComandoId"
          },
          "operacion": {
            "type": "string",
            "enum": [
              "REGISTRAR_PLANTACION_INICIAL"
            ]
          },
          "subcampania_id": {
            "$ref": "#/components/schemas/Id"
          },
          "estado": {
            "type": "string",
            "enum": [
              "PREPARADO"
            ]
          }
        },
        "required": [
          "comando_id",
          "operacion",
          "subcampania_id",
          "estado"
        ]
      },
      "Carga": {
        "type": "object",
        "additionalProperties": false,
        "properties": {
          "carga_id": {
            "$ref": "#/components/schemas/ComandoId"
          },
          "estado": {
            "type": "string",
            "enum": [
              "RESERVADA",
              "DISPONIBLE",
              "VINCULADA",
              "DESCARTE_PENDIENTE",
              "DESCARTADA"
            ]
          },
          "evidencia_id": {
            "type": "string",
            "nullable": true,
            "pattern": "^[1-9][0-9]*$",
            "maxLength": 19
          },
          "creado_en": {
            "type": "string",
            "format": "date-time",
            "pattern": "Z$"
          },
          "expira_en": {
            "type": "string",
            "format": "date-time",
            "pattern": "Z$",
            "nullable": true
          }
        },
        "required": [
          "carga_id",
          "estado",
          "evidencia_id",
          "creado_en",
          "expira_en"
        ]
      },
      "Preview": {
        "type": "object",
        "additionalProperties": false,
        "properties": {
          "url": {
            "type": "string",
            "format": "uri"
          },
          "expira_en": {
            "type": "string",
            "format": "date-time",
            "pattern": "Z$"
          }
        },
        "required": [
          "url",
          "expira_en"
        ]
      },
      "ContextoRegistroLectura": {
        "type": "object",
        "additionalProperties": false,
        "properties": {
          "data": {
            "$ref": "#/components/schemas/ContextoRegistro"
          },
          "observado_en": {
            "type": "string",
            "format": "date-time",
            "pattern": "Z$"
          }
        },
        "required": [
          "data",
          "observado_en"
        ]
      },
      "DetallePropioLectura": {
        "type": "object",
        "additionalProperties": false,
        "properties": {
          "data": {
            "$ref": "#/components/schemas/DetallePropio"
          },
          "observado_en": {
            "type": "string",
            "format": "date-time",
            "pattern": "Z$"
          }
        },
        "required": [
          "data",
          "observado_en"
        ]
      },
      "PreparacionLectura": {
        "type": "object",
        "additionalProperties": false,
        "properties": {
          "data": {
            "$ref": "#/components/schemas/Preparacion"
          },
          "observado_en": {
            "type": "string",
            "format": "date-time",
            "pattern": "Z$"
          }
        },
        "required": [
          "data",
          "observado_en"
        ]
      },
      "CargaLectura": {
        "type": "object",
        "additionalProperties": false,
        "properties": {
          "data": {
            "$ref": "#/components/schemas/Carga"
          },
          "observado_en": {
            "type": "string",
            "format": "date-time",
            "pattern": "Z$"
          }
        },
        "required": [
          "data",
          "observado_en"
        ]
      },
      "CargasLectura": {
        "type": "object",
        "additionalProperties": false,
        "properties": {
          "data": {
            "type": "array",
            "items": {
              "$ref": "#/components/schemas/Carga"
            },
            "minItems": 0,
            "maxItems": 10
          },
          "observado_en": {
            "type": "string",
            "format": "date-time",
            "pattern": "Z$"
          }
        },
        "required": [
          "data",
          "observado_en"
        ]
      },
      "PreviewLectura": {
        "type": "object",
        "additionalProperties": false,
        "properties": {
          "data": {
            "$ref": "#/components/schemas/Preview"
          },
          "observado_en": {
            "type": "string",
            "format": "date-time",
            "pattern": "Z$"
          }
        },
        "required": [
          "data",
          "observado_en"
        ]
      },
      "PreparacionORecibo": {
        "oneOf": [
          {
            "$ref": "#/components/schemas/PreparacionLectura"
          },
          {
            "$ref": "#/components/schemas/Recibo"
          }
        ]
      }
    },
    "securitySchemes": {
      "bearerAuth": {
        "type": "http",
        "scheme": "bearer",
        "bearerFormat": "JWT"
      }
    }
  }
} as unknown as Pick<OpenAPIObject, 'paths' | 'components'>;
