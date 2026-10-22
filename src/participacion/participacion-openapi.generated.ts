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
                "REGISTRAR_PLANTACION_INICIAL",
                "CORREGIR_OBSERVACIONES_PLANTACION"
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
    },
    "/api/v1/impact/imagenes/{evidenciaId}": {
      "get": {
        "summary": "JPEG público sanitizado de evidencia vinculada elegible, incluido legado",
        "operationId": "ImagenPublicaSanitizada",
        "security": [],
        "parameters": [
          {
            "name": "evidenciaId",
            "in": "path",
            "required": true,
            "schema": {
              "$ref": "#/components/schemas/Id"
            }
          }
        ],
        "responses": {
          "200": {
            "description": "JPEG sin EXIF, nunca original ni pendiente.",
            "headers": {
              "Cache-Control": {
                "schema": {
                  "type": "string"
                },
                "description": "no-store"
              }
            },
            "content": {
              "image/jpeg": {
                "schema": {
                  "type": "string",
                  "format": "binary"
                }
              }
            }
          },
          "404": {
            "description": "Imagen no elegible o no encontrada."
          },
          "503": {
            "description": "Imagen no disponible temporalmente."
          }
        }
      }
    },
    "/api/v1/impact/global": {
      "get": {
        "summary": "Impacto global público",
        "operationId": "Impactoglobalpblico",
        "description": "Sin JWT, cuenta, perfil ni capacidades; misma proyección con sesión ausente o vencida. Solo ACTIVA, COMPLETADA y FINALIZADA_PARCIAL, sin borrados. Filtros estrictos: desconocidos o incompatibles con la ruta producen 422; desde/hasta inclusivos y desde <= hasta. Los agregados y el mapa incluyen todo el alcance filtrado; cursor y limite paginan solamente registros, en orden id DESC, id < cursor. planta_id selecciona registros que contienen la especie y conserva la cantidad grupal completa. Sin inferir stock, superficie plantada, afiliación vigente ni crédito exclusivo.",
        "security": [],
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
            "name": "subcampania_id",
            "in": "query",
            "required": false,
            "schema": {
              "$ref": "#/components/schemas/Id"
            }
          },
          {
            "name": "organizacion_id",
            "in": "query",
            "required": false,
            "schema": {
              "$ref": "#/components/schemas/Id"
            }
          },
          {
            "name": "planta_id",
            "in": "query",
            "required": false,
            "schema": {
              "$ref": "#/components/schemas/Id"
            }
          },
          {
            "name": "desde",
            "in": "query",
            "required": false,
            "schema": {
              "type": "string",
              "format": "date",
              "pattern": "^\\d{4}-\\d{2}-\\d{2}$"
            }
          },
          {
            "name": "hasta",
            "in": "query",
            "required": false,
            "schema": {
              "type": "string",
              "format": "date",
              "pattern": "^\\d{4}-\\d{2}-\\d{2}$"
            }
          },
          {
            "name": "cursor",
            "in": "query",
            "required": false,
            "schema": {
              "$ref": "#/components/schemas/Id"
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
            "description": "Proyección pública elegible.",
            "headers": {
              "Cache-Control": {
                "schema": {
                  "type": "string"
                },
                "description": "no-store"
              }
            },
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ImpactoConsultaRespuesta"
                }
              }
            }
          },
          "404": {
            "description": "RECURSO_NO_VISIBLE; no confirma existencia de ámbitos internos o ajenos.",
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
            "description": "ENTRADA_INVALIDA; filtros, identificador o paginación inválidos.",
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
            "description": "RESULTADO_NO_DETERMINADO; lectura no disponible temporalmente, reintento NO_APLICA.",
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
    "/api/v1/impact/campanias/{id}": {
      "get": {
        "summary": "Impacto público de campaña",
        "operationId": "Impactopblicodecampaa",
        "description": "Sin JWT, cuenta, perfil ni capacidades; misma proyección con sesión ausente o vencida. Solo ACTIVA, COMPLETADA y FINALIZADA_PARCIAL, sin borrados. Filtros estrictos: desconocidos o incompatibles con la ruta producen 422; desde/hasta inclusivos y desde <= hasta. Los agregados y el mapa incluyen todo el alcance filtrado; cursor y limite paginan solamente registros, en orden id DESC, id < cursor. planta_id selecciona registros que contienen la especie y conserva la cantidad grupal completa. Sin inferir stock, superficie plantada, afiliación vigente ni crédito exclusivo.",
        "security": [],
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
            "name": "subcampania_id",
            "in": "query",
            "required": false,
            "schema": {
              "$ref": "#/components/schemas/Id"
            }
          },
          {
            "name": "organizacion_id",
            "in": "query",
            "required": false,
            "schema": {
              "$ref": "#/components/schemas/Id"
            }
          },
          {
            "name": "planta_id",
            "in": "query",
            "required": false,
            "schema": {
              "$ref": "#/components/schemas/Id"
            }
          },
          {
            "name": "desde",
            "in": "query",
            "required": false,
            "schema": {
              "type": "string",
              "format": "date",
              "pattern": "^\\d{4}-\\d{2}-\\d{2}$"
            }
          },
          {
            "name": "hasta",
            "in": "query",
            "required": false,
            "schema": {
              "type": "string",
              "format": "date",
              "pattern": "^\\d{4}-\\d{2}-\\d{2}$"
            }
          },
          {
            "name": "cursor",
            "in": "query",
            "required": false,
            "schema": {
              "$ref": "#/components/schemas/Id"
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
            "description": "Proyección pública elegible.",
            "headers": {
              "Cache-Control": {
                "schema": {
                  "type": "string"
                },
                "description": "no-store"
              }
            },
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ImpactoConsultaRespuesta"
                }
              }
            }
          },
          "404": {
            "description": "RECURSO_NO_VISIBLE; no confirma existencia de ámbitos internos o ajenos.",
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
            "description": "ENTRADA_INVALIDA; filtros, identificador o paginación inválidos.",
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
            "description": "RESULTADO_NO_DETERMINADO; lectura no disponible temporalmente, reintento NO_APLICA.",
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
    "/api/v1/impact/subcampanias/{id}": {
      "get": {
        "summary": "Impacto público de subcampaña",
        "operationId": "Impactopblicodesubcampaa",
        "description": "Sin JWT, cuenta, perfil ni capacidades; misma proyección con sesión ausente o vencida. Solo ACTIVA, COMPLETADA y FINALIZADA_PARCIAL, sin borrados. Filtros estrictos: desconocidos o incompatibles con la ruta producen 422; desde/hasta inclusivos y desde <= hasta. Los agregados y el mapa incluyen todo el alcance filtrado; cursor y limite paginan solamente registros, en orden id DESC, id < cursor. planta_id selecciona registros que contienen la especie y conserva la cantidad grupal completa. Sin inferir stock, superficie plantada, afiliación vigente ni crédito exclusivo.",
        "security": [],
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
            "name": "organizacion_id",
            "in": "query",
            "required": false,
            "schema": {
              "$ref": "#/components/schemas/Id"
            }
          },
          {
            "name": "planta_id",
            "in": "query",
            "required": false,
            "schema": {
              "$ref": "#/components/schemas/Id"
            }
          },
          {
            "name": "desde",
            "in": "query",
            "required": false,
            "schema": {
              "type": "string",
              "format": "date",
              "pattern": "^\\d{4}-\\d{2}-\\d{2}$"
            }
          },
          {
            "name": "hasta",
            "in": "query",
            "required": false,
            "schema": {
              "type": "string",
              "format": "date",
              "pattern": "^\\d{4}-\\d{2}-\\d{2}$"
            }
          },
          {
            "name": "cursor",
            "in": "query",
            "required": false,
            "schema": {
              "$ref": "#/components/schemas/Id"
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
            "description": "Proyección pública elegible.",
            "headers": {
              "Cache-Control": {
                "schema": {
                  "type": "string"
                },
                "description": "no-store"
              }
            },
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ImpactoConsultaRespuesta"
                }
              }
            }
          },
          "404": {
            "description": "RECURSO_NO_VISIBLE; no confirma existencia de ámbitos internos o ajenos.",
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
            "description": "ENTRADA_INVALIDA; filtros, identificador o paginación inválidos.",
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
            "description": "RESULTADO_NO_DETERMINADO; lectura no disponible temporalmente, reintento NO_APLICA.",
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
    "/api/v1/impact/registros/{id}": {
      "get": {
        "summary": "Registro grupal público",
        "operationId": "Registrogrupalpblico",
        "description": "Detalle público compartible sin JWT, cuenta ni perfil. No acepta query. Devuelve 404 para inexistentes, borrados o ámbitos no elegibles sin distinguirlos. Nombres y afiliación son snapshots históricos; NO_DECLARADA e HISTORICA_NO_DISPONIBLE son estados distintos. Fotos solo vinculadas elegibles sanitizadas mediante /api/v1/impact/imagenes/:id; nunca originales, pendientes ni metadatos fotográficos.",
        "security": [],
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
            "description": "Proyección pública elegible.",
            "headers": {
              "Cache-Control": {
                "schema": {
                  "type": "string"
                },
                "description": "no-store"
              }
            },
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ImpactoRegistroRespuesta"
                }
              }
            }
          },
          "404": {
            "description": "RECURSO_NO_VISIBLE; no confirma existencia de ámbitos internos o ajenos.",
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
            "description": "ENTRADA_INVALIDA; filtros, identificador o paginación inválidos.",
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
            "description": "RESULTADO_NO_DETERMINADO; lectura no disponible temporalmente, reintento NO_APLICA.",
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
    "/api/v1/plantaciones/mis-registros": {
      "get": {
        "summary": "Mis registros históricos",
        "operationId": "Misregistroshistricos",
        "description": "JWT vigente y cuenta activa. Autoría o participación histórica; no exige permiso operativo. Una fila por registro y relaciones identificables. No concede crédito individual ni campos privados del autor al participante. Cursor decimal exclusivo: id < cursor, orden id DESC. Solo cursor y limite; campos desconocidos rechazados con 422.",
        "security": [
          {
            "bearerAuth": []
          }
        ],
        "parameters": [
          {
            "name": "cursor",
            "in": "query",
            "required": false,
            "schema": {
              "$ref": "#/components/schemas/Id"
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
            "description": "Lista propia histórica deduplicada.",
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
                  "$ref": "#/components/schemas/MisRegistrosRespuesta"
                }
              }
            }
          },
          "401": {
            "description": "Sesión ausente o vencida.",
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
            "description": "CUENTA_INACTIVA; recuperar sesión con una cuenta activa.",
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
            "description": "RECURSO_NO_VISIBLE; no confirma existencia de ámbitos internos o ajenos.",
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
            "description": "ENTRADA_INVALIDA; filtros, identificador o paginación inválidos.",
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
            "description": "RESULTADO_NO_DETERMINADO; lectura no disponible temporalmente, reintento NO_APLICA.",
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
    "/api/v1/plantaciones/{id}/contexto-correccion": {
      "get": {
        "summary": "Contexto autorizado de corrección",
        "operationId": "Contextoautorizadodecorreccin",
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
                  "$ref": "#/components/schemas/ContextoCorreccionLectura"
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
        "description": "ADMIN global o administrador vigente de la subcampaña exacta. El administrador contextual recibe observaciones null y capacidad false. Leer no reserva revisión, autoridad ni estado; no acepta query."
      }
    },
    "/api/v1/plantaciones/{id}/historial-correcciones": {
      "get": {
        "summary": "Historial autorizado de correcciones",
        "operationId": "Historialautorizadodecorrecciones",
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
              "maximum": 50,
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
                  "$ref": "#/components/schemas/HistorialCorreccionesLectura"
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
        "description": "Auditoría privada autorizada, ID DESC. Cursor firmado y ligado a actor, sesión y registro. Revalida autoridad en cada página. El administrador contextual recibe motivo y observaciones null. Sin perfiles ni fotos privadas."
      }
    },
    "/api/v1/plantaciones/{id}/correcciones/observaciones": {
      "post": {
        "summary": "CORREGIR_OBSERVACIONES_PLANTACION",
        "operationId": "CORREGIROBSERVACIONESPLANTACION",
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
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "$ref": "#/components/schemas/CorreccionObservacionesEntrada"
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
            "description": "DTO inválido inconcluso o rechazo de negocio durable.",
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
            "description": "Infraestructura inconclusa; recuperar con la misma clave.",
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
        "description": "Solo ADMIN global y subcampaña ACTIVA. Original conservado; overlay, revisión, historial y recibo en una transacción. Replay terminal precede a nueva autorización. SIN_CAMBIOS no incrementa revisiones ni crea historial. No modifica stock. El recibo no contiene observaciones ni motivo."
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
              "REGISTRAR_PLANTACION_INICIAL",
              "CORREGIR_OBSERVACIONES_PLANTACION"
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
              },
              {
                "$ref": "#/components/schemas/CorreccionPlantacionResultado"
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
              "REGISTRAR_PLANTACION_INICIAL",
              "CORREGIR_OBSERVACIONES_PLANTACION"
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
      },
      "ImpactoConsultaQuery": {
        "type": "object",
        "additionalProperties": false,
        "properties": {
          "campania_id": {
            "$ref": "#/components/schemas/Id"
          },
          "subcampania_id": {
            "$ref": "#/components/schemas/Id"
          },
          "organizacion_id": {
            "$ref": "#/components/schemas/Id"
          },
          "planta_id": {
            "$ref": "#/components/schemas/Id"
          },
          "desde": {
            "type": "string",
            "format": "date",
            "pattern": "^\\d{4}-\\d{2}-\\d{2}$"
          },
          "hasta": {
            "type": "string",
            "format": "date",
            "pattern": "^\\d{4}-\\d{2}-\\d{2}$"
          },
          "cursor": {
            "$ref": "#/components/schemas/Id"
          },
          "limite": {
            "type": "integer",
            "minimum": 1,
            "maximum": 100,
            "default": 20
          }
        },
        "required": []
      },
      "MisRegistrosQuery": {
        "type": "object",
        "additionalProperties": false,
        "properties": {
          "cursor": {
            "$ref": "#/components/schemas/Id"
          },
          "limite": {
            "type": "integer",
            "minimum": 1,
            "maximum": 100,
            "default": 20
          }
        },
        "required": []
      },
      "ImpactoAfiliacion": {
        "type": "object",
        "additionalProperties": false,
        "properties": {
          "estado": {
            "type": "string",
            "enum": [
              "DECLARADA",
              "NO_DECLARADA",
              "HISTORICA_NO_DISPONIBLE"
            ]
          },
          "tipo": {
            "type": "string",
            "nullable": true,
            "enum": [
              "ORGANIZACION_REGISTRADA",
              "OTRA",
              null
            ]
          },
          "nombre": {
            "type": "string",
            "nullable": true
          },
          "organizacion_id": {
            "type": "string",
            "nullable": true,
            "pattern": "^[1-9][0-9]*$",
            "maxLength": 19
          }
        },
        "required": [
          "estado",
          "tipo",
          "nombre",
          "organizacion_id"
        ]
      },
      "ImpactoPersona": {
        "type": "object",
        "additionalProperties": false,
        "properties": {
          "nombre": {
            "type": "string",
            "nullable": true
          },
          "es_responsable": {
            "type": "boolean"
          },
          "afiliacion": {
            "$ref": "#/components/schemas/ImpactoAfiliacion"
          }
        },
        "required": [
          "nombre",
          "es_responsable",
          "afiliacion"
        ]
      },
      "ImpactoRegistro": {
        "type": "object",
        "additionalProperties": false,
        "properties": {
          "id": {
            "$ref": "#/components/schemas/Id"
          },
          "codigo_trazabilidad": {
            "type": "string"
          },
          "campania_id": {
            "$ref": "#/components/schemas/Id"
          },
          "subcampania_id": {
            "$ref": "#/components/schemas/Id"
          },
          "campania_nombre": {
            "type": "string"
          },
          "subcampania_nombre": {
            "type": "string"
          },
          "fecha_plantacion": {
            "type": "string",
            "format": "date",
            "pattern": "^\\d{4}-\\d{2}-\\d{2}$"
          },
          "cantidad_total_plantada": {
            "type": "integer",
            "minimum": 1,
            "maximum": 2147483647
          },
          "es_reposicion": {
            "type": "boolean"
          },
          "registro_plantacion_origen_id": {
            "type": "string",
            "nullable": true,
            "pattern": "^[1-9][0-9]*$",
            "maxLength": 19
          },
          "latitud": {
            "type": "number",
            "minimum": -90,
            "maximum": 90
          },
          "longitud": {
            "type": "number",
            "minimum": -180,
            "maximum": 180
          },
          "gps_dentro_poligono": {
            "type": "boolean"
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
                  "type": "string",
                  "nullable": true
                },
                "cantidad": {
                  "type": "integer",
                  "minimum": 1,
                  "maximum": 2147483647
                }
              },
              "required": [
                "planta_id",
                "nombre",
                "cantidad"
              ]
            }
          },
          "personas": {
            "type": "array",
            "items": {
              "$ref": "#/components/schemas/ImpactoPersona"
            },
            "minItems": 1,
            "maxItems": 101
          },
          "fotos": {
            "type": "array",
            "items": {
              "type": "object",
              "additionalProperties": false,
              "properties": {
                "id": {
                  "$ref": "#/components/schemas/Id"
                },
                "url": {
                  "type": "string",
                  "pattern": "^/api/v1/impact/imagenes/[1-9][0-9]*$"
                }
              },
              "required": [
                "id",
                "url"
              ]
            }
          },
          "seguimiento": {
            "type": "object",
            "additionalProperties": false,
            "properties": {
              "bajas_reportadas": {
                "type": "integer",
                "minimum": 0
              },
              "reposiciones_registradas": {
                "type": "integer",
                "minimum": 0
              },
              "bajas": {
                "type": "array",
                "items": {
                  "type": "object",
                  "additionalProperties": false,
                  "properties": {
                    "evento_id": {
                      "$ref": "#/components/schemas/Id"
                    },
                    "fecha": {
                      "type": "string",
                      "format": "date-time",
                      "pattern": "Z$"
                    },
                    "cantidad": {
                      "type": "integer",
                      "minimum": 1,
                      "maximum": 2147483647
                    }
                  },
                  "required": [
                    "evento_id",
                    "fecha",
                    "cantidad"
                  ]
                }
              },
              "reposiciones": {
                "type": "array",
                "items": {
                  "type": "object",
                  "additionalProperties": false,
                  "properties": {
                    "registro_id": {
                      "$ref": "#/components/schemas/Id"
                    },
                    "fecha": {
                      "type": "string",
                      "format": "date",
                      "pattern": "^\\d{4}-\\d{2}-\\d{2}$"
                    },
                    "cantidad": {
                      "type": "integer",
                      "minimum": 1,
                      "maximum": 2147483647
                    },
                    "url_publica": {
                      "type": "string",
                      "pattern": "^/api/v1/impact/registros/[1-9][0-9]*$"
                    }
                  },
                  "required": [
                    "registro_id",
                    "fecha",
                    "cantidad",
                    "url_publica"
                  ]
                }
              }
            },
            "required": [
              "bajas_reportadas",
              "reposiciones_registradas",
              "bajas",
              "reposiciones"
            ]
          },
          "organizaciones_campania": {
            "type": "array",
            "items": {
              "type": "object",
              "additionalProperties": false,
              "properties": {
                "id": {
                  "$ref": "#/components/schemas/Id"
                },
                "nombre": {
                  "type": "string"
                }
              },
              "required": [
                "id",
                "nombre"
              ]
            }
          },
          "url_publica": {
            "type": "string",
            "pattern": "^/api/v1/impact/registros/[1-9][0-9]*$"
          }
        },
        "required": [
          "id",
          "codigo_trazabilidad",
          "campania_id",
          "subcampania_id",
          "campania_nombre",
          "subcampania_nombre",
          "fecha_plantacion",
          "cantidad_total_plantada",
          "es_reposicion",
          "registro_plantacion_origen_id",
          "latitud",
          "longitud",
          "gps_dentro_poligono",
          "especies",
          "personas",
          "fotos",
          "seguimiento",
          "organizaciones_campania",
          "url_publica"
        ]
      },
      "ImpactoCampania": {
        "type": "object",
        "additionalProperties": false,
        "properties": {
          "id": {
            "$ref": "#/components/schemas/Id"
          },
          "nombre": {
            "type": "string"
          },
          "plantacion_inicial": {
            "type": "integer",
            "minimum": 0
          },
          "url_publica": {
            "type": "string",
            "pattern": "^/api/v1/impact/campanias/[1-9][0-9]*$"
          }
        },
        "required": [
          "id",
          "nombre",
          "plantacion_inicial",
          "url_publica"
        ]
      },
      "ImpactoSubcampania": {
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
          "estado": {
            "type": "string",
            "enum": [
              "ACTIVA",
              "COMPLETADA",
              "FINALIZADA_PARCIAL"
            ]
          },
          "zona": {
            "type": "string",
            "nullable": true
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
            ],
            "nullable": true,
            "description": "Zona de trabajo; no representa superficie efectivamente plantada."
          },
          "meta_inicial": {
            "type": "integer",
            "minimum": 0
          },
          "plantacion_inicial": {
            "type": "integer",
            "minimum": 0
          },
          "faltantes": {
            "type": "integer",
            "minimum": 0,
            "description": "max(meta_inicial - plantacion_inicial, 0); bajas y reposiciones no lo modifican."
          },
          "avance_porcentaje": {
            "type": "number",
            "minimum": 0,
            "nullable": true,
            "description": "100 * plantacion_inicial / meta_inicial; puede superar 100. null si no hay meta positiva."
          },
          "reposiciones": {
            "type": "integer",
            "minimum": 0
          },
          "bajas_reportadas": {
            "type": "integer",
            "minimum": 0
          },
          "registros": {
            "type": "integer",
            "minimum": 0
          },
          "url_publica": {
            "type": "string",
            "pattern": "^/api/v1/impact/subcampanias/[1-9][0-9]*$"
          }
        },
        "required": [
          "id",
          "campania_id",
          "nombre",
          "estado",
          "zona",
          "poligono",
          "meta_inicial",
          "plantacion_inicial",
          "faltantes",
          "avance_porcentaje",
          "reposiciones",
          "bajas_reportadas",
          "registros",
          "url_publica"
        ]
      },
      "ImpactoPunto": {
        "type": "object",
        "additionalProperties": false,
        "properties": {
          "registro_id": {
            "$ref": "#/components/schemas/Id"
          },
          "subcampania_id": {
            "$ref": "#/components/schemas/Id"
          },
          "latitud": {
            "type": "number",
            "minimum": -90,
            "maximum": 90
          },
          "longitud": {
            "type": "number",
            "minimum": -180,
            "maximum": 180
          },
          "cantidad_total_plantada": {
            "type": "integer",
            "minimum": 1,
            "maximum": 2147483647
          },
          "es_reposicion": {
            "type": "boolean"
          },
          "url_publica": {
            "type": "string",
            "pattern": "^/api/v1/impact/registros/[1-9][0-9]*$"
          }
        },
        "required": [
          "registro_id",
          "subcampania_id",
          "latitud",
          "longitud",
          "cantidad_total_plantada",
          "es_reposicion",
          "url_publica"
        ]
      },
      "ImpactoConsulta": {
        "type": "object",
        "additionalProperties": false,
        "properties": {
          "indicadores": {
            "type": "object",
            "additionalProperties": false,
            "properties": {
              "plantacion_inicial": {
                "type": "integer",
                "minimum": 0
              },
              "reposiciones": {
                "type": "integer",
                "minimum": 0
              },
              "bajas_reportadas": {
                "type": "integer",
                "minimum": 0
              },
              "registros": {
                "type": "integer",
                "minimum": 0
              }
            },
            "required": [
              "plantacion_inicial",
              "reposiciones",
              "bajas_reportadas",
              "registros"
            ]
          },
          "campanias": {
            "type": "array",
            "items": {
              "$ref": "#/components/schemas/ImpactoCampania"
            }
          },
          "subcampanias": {
            "type": "array",
            "items": {
              "$ref": "#/components/schemas/ImpactoSubcampania"
            }
          },
          "mapa": {
            "type": "array",
            "items": {
              "$ref": "#/components/schemas/ImpactoPunto"
            }
          },
          "registros": {
            "type": "array",
            "items": {
              "$ref": "#/components/schemas/ImpactoRegistro"
            },
            "minItems": 0,
            "maxItems": 100
          },
          "siguiente_cursor": {
            "type": "string",
            "nullable": true,
            "pattern": "^[1-9][0-9]*$",
            "maxLength": 19
          }
        },
        "required": [
          "indicadores",
          "campanias",
          "subcampanias",
          "mapa",
          "registros",
          "siguiente_cursor"
        ]
      },
      "MisRegistros": {
        "type": "object",
        "additionalProperties": false,
        "properties": {
          "registros": {
            "type": "array",
            "items": {
              "type": "object",
              "additionalProperties": false,
              "properties": {
                "id": {
                  "$ref": "#/components/schemas/Id"
                },
                "subcampania_id": {
                  "$ref": "#/components/schemas/Id"
                },
                "fecha_plantacion": {
                  "type": "string",
                  "format": "date",
                  "pattern": "^\\d{4}-\\d{2}-\\d{2}$"
                },
                "codigo_trazabilidad": {
                  "type": "string"
                },
                "cantidad_total_plantada": {
                  "type": "integer",
                  "minimum": 1,
                  "maximum": 2147483647
                },
                "es_reposicion": {
                  "type": "boolean"
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
                "url_publica": {
                  "type": "string",
                  "nullable": true,
                  "pattern": "^/api/v1/impact/registros/[1-9][0-9]*$"
                },
                "url_detalle_propio": {
                  "type": "string",
                  "pattern": "^/api/v1/plantaciones/[1-9][0-9]*/detalle-propio$"
                }
              },
              "required": [
                "id",
                "subcampania_id",
                "fecha_plantacion",
                "codigo_trazabilidad",
                "cantidad_total_plantada",
                "es_reposicion",
                "relaciones",
                "url_publica",
                "url_detalle_propio"
              ]
            },
            "minItems": 0,
            "maxItems": 100
          },
          "siguiente_cursor": {
            "type": "string",
            "nullable": true,
            "pattern": "^[1-9][0-9]*$",
            "maxLength": 19
          }
        },
        "required": [
          "registros",
          "siguiente_cursor"
        ]
      },
      "ImpactoConsultaRespuesta": {
        "type": "object",
        "additionalProperties": false,
        "properties": {
          "data": {
            "$ref": "#/components/schemas/ImpactoConsulta"
          }
        },
        "required": [
          "data"
        ]
      },
      "ImpactoRegistroRespuesta": {
        "type": "object",
        "additionalProperties": false,
        "properties": {
          "data": {
            "$ref": "#/components/schemas/ImpactoRegistro"
          }
        },
        "required": [
          "data"
        ]
      },
      "MisRegistrosRespuesta": {
        "type": "object",
        "additionalProperties": false,
        "properties": {
          "data": {
            "$ref": "#/components/schemas/MisRegistros"
          }
        },
        "required": [
          "data"
        ]
      },
      "CorreccionObservacionesEntrada": {
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
            "maxLength": 1000,
            "description": "Texto NFC/trim obligatorio; nunca se incluye en el recibo."
          },
          "observaciones": {
            "type": "string",
            "nullable": true,
            "maxLength": 2000,
            "description": "Campo obligatorio; NFC/trim. Vacío equivale a null."
          }
        },
        "required": [
          "comando_id",
          "revision_esperada",
          "motivo",
          "observaciones"
        ]
      },
      "CorreccionPlantacionResultado": {
        "type": "object",
        "additionalProperties": false,
        "properties": {
          "tipo": {
            "type": "string",
            "enum": [
              "CORRECCION_PLANTACION"
            ]
          },
          "correccion_id": {
            "type": "string",
            "nullable": true,
            "pattern": "^[1-9][0-9]*$",
            "maxLength": 19
          },
          "registro_plantacion_id": {
            "$ref": "#/components/schemas/Id"
          },
          "subcampania_id": {
            "$ref": "#/components/schemas/Id"
          },
          "caso": {
            "type": "string",
            "enum": [
              "OBSERVACIONES"
            ]
          },
          "revision_anterior": {
            "$ref": "#/components/schemas/Revision"
          },
          "revision_nueva": {
            "$ref": "#/components/schemas/Revision"
          },
          "revision_grupo_anterior": {
            "$ref": "#/components/schemas/Revision"
          },
          "revision_grupo_nueva": {
            "$ref": "#/components/schemas/Revision"
          },
          "cambio": {
            "type": "string",
            "enum": [
              "CAMBIO_APLICADO",
              "SIN_CAMBIOS"
            ]
          },
          "estado_logico": {
            "type": "string",
            "enum": [
              "VIGENTE"
            ]
          },
          "registro_vigente_id": {
            "type": "string",
            "nullable": true,
            "pattern": "^[1-9][0-9]*$",
            "maxLength": 19,
            "enum": [
              null
            ]
          }
        },
        "required": [
          "tipo",
          "correccion_id",
          "registro_plantacion_id",
          "subcampania_id",
          "caso",
          "revision_anterior",
          "revision_nueva",
          "revision_grupo_anterior",
          "revision_grupo_nueva",
          "cambio",
          "estado_logico",
          "registro_vigente_id"
        ]
      },
      "ContextoCorreccion": {
        "type": "object",
        "additionalProperties": false,
        "properties": {
          "registro_plantacion_id": {
            "$ref": "#/components/schemas/Id"
          },
          "subcampania_id": {
            "$ref": "#/components/schemas/Id"
          },
          "campania_id": {
            "$ref": "#/components/schemas/Id"
          },
          "estado_subcampania": {
            "type": "string",
            "enum": [
              "BORRADOR",
              "ACTIVA",
              "PAUSADA",
              "COMPLETADA",
              "FINALIZADA_PARCIAL",
              "CANCELADA"
            ]
          },
          "es_reposicion": {
            "type": "boolean"
          },
          "estado_logico": {
            "type": "string",
            "enum": [
              "VIGENTE",
              "REVERTIDO"
            ]
          },
          "revision_registro": {
            "$ref": "#/components/schemas/Revision"
          },
          "revision_grupo": {
            "$ref": "#/components/schemas/Revision"
          },
          "observaciones_visibles": {
            "type": "boolean"
          },
          "original": {
            "type": "object",
            "additionalProperties": false,
            "properties": {
              "observaciones": {
                "type": "string",
                "nullable": true
              }
            },
            "required": [
              "observaciones"
            ]
          },
          "efectivo": {
            "type": "object",
            "additionalProperties": false,
            "properties": {
              "observaciones": {
                "type": "string",
                "nullable": true
              }
            },
            "required": [
              "observaciones"
            ]
          },
          "capacidades": {
            "type": "object",
            "additionalProperties": false,
            "properties": {
              "corregir_observaciones": {
                "type": "boolean"
              }
            },
            "required": [
              "corregir_observaciones"
            ]
          }
        },
        "required": [
          "registro_plantacion_id",
          "subcampania_id",
          "campania_id",
          "estado_subcampania",
          "es_reposicion",
          "estado_logico",
          "revision_registro",
          "revision_grupo",
          "observaciones_visibles",
          "original",
          "efectivo",
          "capacidades"
        ]
      },
      "HistoriaCorreccionObservaciones": {
        "type": "object",
        "additionalProperties": false,
        "properties": {
          "correccion_id": {
            "$ref": "#/components/schemas/Id"
          },
          "caso": {
            "type": "string",
            "enum": [
              "OBSERVACIONES"
            ]
          },
          "actor": {
            "type": "object",
            "additionalProperties": false,
            "properties": {
              "usuario_id": {
                "$ref": "#/components/schemas/Id"
              },
              "nombre_snapshot": {
                "type": "string",
                "nullable": true
              }
            },
            "required": [
              "usuario_id",
              "nombre_snapshot"
            ]
          },
          "fecha": {
            "type": "string",
            "format": "date-time",
            "pattern": "Z$"
          },
          "revision_anterior": {
            "$ref": "#/components/schemas/Revision"
          },
          "revision_nueva": {
            "$ref": "#/components/schemas/Revision"
          },
          "revision_grupo_anterior": {
            "$ref": "#/components/schemas/Revision"
          },
          "revision_grupo_nueva": {
            "$ref": "#/components/schemas/Revision"
          },
          "motivo": {
            "type": "string",
            "nullable": true
          },
          "observaciones_visibles": {
            "type": "boolean"
          },
          "antes": {
            "type": "object",
            "additionalProperties": false,
            "properties": {
              "observaciones": {
                "type": "string",
                "nullable": true
              }
            },
            "required": [
              "observaciones"
            ]
          },
          "despues": {
            "type": "object",
            "additionalProperties": false,
            "properties": {
              "observaciones": {
                "type": "string",
                "nullable": true
              }
            },
            "required": [
              "observaciones"
            ]
          },
          "efectos_consumo": {
            "type": "array",
            "items": {
              "type": "object",
              "additionalProperties": false,
              "properties": {},
              "required": []
            },
            "minItems": 0,
            "maxItems": 0
          }
        },
        "required": [
          "correccion_id",
          "caso",
          "actor",
          "fecha",
          "revision_anterior",
          "revision_nueva",
          "revision_grupo_anterior",
          "revision_grupo_nueva",
          "motivo",
          "observaciones_visibles",
          "antes",
          "despues",
          "efectos_consumo"
        ]
      },
      "ContextoCorreccionLectura": {
        "type": "object",
        "additionalProperties": false,
        "properties": {
          "data": {
            "$ref": "#/components/schemas/ContextoCorreccion"
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
      "HistorialCorreccionesLectura": {
        "type": "object",
        "additionalProperties": false,
        "properties": {
          "data": {
            "type": "array",
            "items": {
              "$ref": "#/components/schemas/HistoriaCorreccionObservaciones"
            },
            "minItems": 0,
            "maxItems": 50
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
