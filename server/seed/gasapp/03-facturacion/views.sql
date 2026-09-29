CREATE VIEW facturacion.v_venta_facturada AS
SELECT v.id AS venta_id,
       v.fecha,
       v.total,
       f.numero,
       f.fecha_emision
FROM ventas.venta v
JOIN facturacion.factura f ON f.venta_id = v.id
WHERE v.facturada = 1;
