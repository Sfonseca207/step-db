// GasApp (ejemplo) · MongoDB (mongosh)
// Generado por StepDB. Modelo completo.

// ========================================================================
// Step 04 · Log de integraciones (1 oct 2026)
// Logs de envíos a servicios externos en MongoDB, fuera de SQL Server.
// ========================================================================

db.createCollection("log_envio_venta", {
  validator: {
    "$jsonSchema": {
      "bsonType": "object",
      "properties": {
        "_id": {
          "bsonType": "objectId"
        },
        "venta_id": {
          "bsonType": "long"
        },
        "servicio": {
          "bsonType": "string",
          "description": "dian | erp | fidelizacion"
        },
        "estado": {
          "bsonType": "string",
          "description": "pendiente | enviado | error"
        },
        "respuesta": {
          "bsonType": "object",
          "properties": {
            "codigo": {
              "bsonType": "int"
            },
            "mensaje": {
              "bsonType": "string"
            }
          }
        },
        "intentos": {
          "bsonType": "int"
        },
        "creado_en": {
          "bsonType": "date"
        }
      },
      "description": "Trazabilidad de envíos de ventas a servicios externos",
      "required": [
        "_id",
        "venta_id",
        "servicio",
        "estado",
        "intentos",
        "creado_en"
      ]
    }
  },
  validationLevel: 'moderate',
});
db.getCollection("log_envio_venta").createIndex({"venta_id":1,"servicio":1});
db.getCollection("log_envio_venta").createIndex({"estado":1});
// Referencia lógica: log_envio_venta.venta_id → ventas.venta.id (SQL Server)
//   No hay FK; la consistencia la garantiza la aplicación. Indexar venta_id en Mongo.

db.createCollection("log_evento_factura", {
  validator: {
    "$jsonSchema": {
      "bsonType": "object",
      "properties": {
        "_id": {
          "bsonType": "objectId"
        },
        "factura_id": {
          "bsonType": "long"
        },
        "evento": {
          "bsonType": "string"
        },
        "payload": {
          "bsonType": "object"
        },
        "etiquetas": {
          "bsonType": "array",
          "items": {
            "bsonType": "string"
          }
        },
        "recibido_en": {
          "bsonType": "date"
        }
      },
      "description": "Eventos DIAN recibidos por factura",
      "required": [
        "_id",
        "factura_id",
        "evento",
        "recibido_en"
      ]
    }
  },
  validationLevel: 'moderate',
});
db.getCollection("log_evento_factura").createIndex({"factura_id":1});
// Referencia lógica: log_evento_factura.factura_id → facturacion.factura.id (SQL Server)
//   No hay FK; la consistencia la garantiza la aplicación. Indexar factura_id en Mongo.
