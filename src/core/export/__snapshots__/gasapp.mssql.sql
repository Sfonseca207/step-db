-- GasApp (ejemplo) · SQL Server
-- Generado por StepDB. Modelo completo.
-- Las colecciones MongoDB y sus referencias lógicas no se incluyen.

-- ------------------------------------------------------------------------
-- Schemas
-- ------------------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name = N'core')
  EXEC(N'CREATE SCHEMA [core]');
GO

IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name = N'ventas')
  EXEC(N'CREATE SCHEMA [ventas]');
GO

IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name = N'terceros')
  EXEC(N'CREATE SCHEMA [terceros]');
GO

IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name = N'facturacion')
  EXEC(N'CREATE SCHEMA [facturacion]');
GO

-- ========================================================================
-- Step 01 · Recepción de ventas (28 sep 2026)
-- Estaciones, productos y ventas recibidas desde los surtidores.
-- ========================================================================
CREATE TABLE [core].[estacion] (
  [id] int IDENTITY(1, 1) PRIMARY KEY,
  [codigo] varchar(10) NOT NULL UNIQUE,
  [nombre] nvarchar(120) NOT NULL,
  [ciudad] nvarchar(80) NOT NULL,
  [activa] bit NOT NULL DEFAULT (1)
);
GO

CREATE TABLE [ventas].[producto] (
  [id] int IDENTITY(1, 1) PRIMARY KEY,
  [codigo] varchar(20) NOT NULL UNIQUE,
  [nombre] nvarchar(80) NOT NULL,
  [unidad] varchar(10) NOT NULL
);
GO

CREATE TABLE [ventas].[venta] (
  [id] bigint IDENTITY(1, 1) PRIMARY KEY,
  [estacion_id] int NOT NULL,
  [producto_id] int NOT NULL,
  [fecha] datetime2 NOT NULL DEFAULT (sysutcdatetime()),
  [cantidad] decimal(12,3) NOT NULL,
  [precio_unitario] decimal(18,2) NOT NULL,
  [total] decimal(18,2) NOT NULL,
  [estado] NVARCHAR(255) NOT NULL DEFAULT (N'registrada') CHECK ([estado] IN (N'registrada', N'anulada')),
  [tercero_id] bigint NULL,
  [facturada] bit NOT NULL DEFAULT (0)
);
GO

CREATE TABLE [ventas].[venta_pago] (
  [id] bigint IDENTITY(1, 1) PRIMARY KEY,
  [venta_id] bigint NOT NULL,
  [medio_pago] varchar(20) NOT NULL,
  [valor] decimal(18,2) NOT NULL
);
GO

-- ========================================================================
-- Step 02 · Terceros y clientes (29 sep 2026)
-- Maestro único de terceros y vehículos de flotas.
-- ========================================================================
CREATE TABLE [terceros].[tercero] (
  [id] bigint IDENTITY(1, 1) PRIMARY KEY,
  [tipo_documento] varchar(5) NOT NULL,
  [numero_documento] varchar(20) NOT NULL,
  [razon_social] nvarchar(160) NOT NULL,
  [email] varchar(160) NULL
);
GO

CREATE TABLE [terceros].[vehiculo] (
  [id] bigint IDENTITY(1, 1) PRIMARY KEY,
  [tercero_id] bigint NOT NULL,
  [placa] varchar(10) NOT NULL UNIQUE
);
GO

-- ========================================================================
-- Step 03 · Facturación (30 sep 2026)
-- Facturación electrónica por venta, resoluciones DIAN y vista de ventas facturadas.
-- ========================================================================
CREATE TABLE [facturacion].[resolucion] (
  [id] int IDENTITY(1, 1) PRIMARY KEY,
  [prefijo] varchar(10) NOT NULL,
  [desde] bigint NOT NULL,
  [hasta] bigint NOT NULL,
  [vigente_hasta] date NOT NULL
);
GO

CREATE TABLE [facturacion].[factura] (
  [id] bigint IDENTITY(1, 1) PRIMARY KEY,
  [venta_id] bigint NOT NULL UNIQUE,
  [tercero_id] bigint NOT NULL,
  [resolucion_id] int NOT NULL,
  [numero] varchar(30) NOT NULL UNIQUE,
  [fecha_emision] datetime2 NOT NULL,
  [total] decimal(18,2) NOT NULL,
  [cufe] varchar(96) NULL
);
GO

-- ------------------------------------------------------------------------
-- Claves foráneas
-- ------------------------------------------------------------------------
ALTER TABLE [ventas].[venta] ADD CONSTRAINT [FK_venta_estacion_id_estacion]
  FOREIGN KEY ([estacion_id]) REFERENCES [core].[estacion] ([id]);
GO

ALTER TABLE [ventas].[venta] ADD CONSTRAINT [FK_venta_producto_id_producto]
  FOREIGN KEY ([producto_id]) REFERENCES [ventas].[producto] ([id]);
GO

ALTER TABLE [ventas].[venta_pago] ADD CONSTRAINT [FK_venta_pago_venta_id_venta]
  FOREIGN KEY ([venta_id]) REFERENCES [ventas].[venta] ([id]);
GO

ALTER TABLE [terceros].[vehiculo] ADD CONSTRAINT [FK_vehiculo_tercero_id_tercero]
  FOREIGN KEY ([tercero_id]) REFERENCES [terceros].[tercero] ([id]);
GO

ALTER TABLE [ventas].[venta] ADD CONSTRAINT [FK_venta_tercero_id_tercero]
  FOREIGN KEY ([tercero_id]) REFERENCES [terceros].[tercero] ([id]);
GO

ALTER TABLE [facturacion].[factura] ADD CONSTRAINT [FK_factura_venta_id_venta]
  FOREIGN KEY ([venta_id]) REFERENCES [ventas].[venta] ([id]);
GO

ALTER TABLE [facturacion].[factura] ADD CONSTRAINT [FK_factura_tercero_id_tercero]
  FOREIGN KEY ([tercero_id]) REFERENCES [terceros].[tercero] ([id]);
GO

ALTER TABLE [facturacion].[factura] ADD CONSTRAINT [FK_factura_resolucion_id_resolucion]
  FOREIGN KEY ([resolucion_id]) REFERENCES [facturacion].[resolucion] ([id]);
GO

-- ------------------------------------------------------------------------
-- Índices
-- ------------------------------------------------------------------------
CREATE INDEX [ix_venta_estacion_fecha] ON [ventas].[venta] ([estacion_id], [fecha]);
GO

CREATE INDEX [ix_venta_producto] ON [ventas].[venta] ([producto_id]);
GO

CREATE INDEX [ix_venta_pago_venta] ON [ventas].[venta_pago] ([venta_id]);
GO

CREATE UNIQUE INDEX [ux_tercero_documento] ON [terceros].[tercero] ([tipo_documento], [numero_documento]);
GO

CREATE INDEX [ix_vehiculo_tercero] ON [terceros].[vehiculo] ([tercero_id]);
GO

CREATE INDEX [ix_factura_tercero] ON [facturacion].[factura] ([tercero_id]);
GO

CREATE INDEX [ix_factura_resolucion] ON [facturacion].[factura] ([resolucion_id]);
GO

-- ------------------------------------------------------------------------
-- Vistas
-- ------------------------------------------------------------------------
-- Step 03 · Facturación
CREATE VIEW facturacion.v_venta_facturada AS
SELECT v.id AS venta_id,
       v.fecha,
       v.total,
       f.numero,
       f.fecha_emision
FROM ventas.venta v
JOIN facturacion.factura f ON f.venta_id = v.id
WHERE v.facturada = 1;
GO

-- ------------------------------------------------------------------------
-- Descripciones
-- ------------------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM sys.extended_properties WHERE major_id = OBJECT_ID(N'core.estacion') AND minor_id = 0 AND name = N'MS_Description')
  EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Estación de servicio',
    @level0type = N'SCHEMA', @level0name = N'core', @level1type = N'TABLE', @level1name = N'estacion';
GO

IF NOT EXISTS (SELECT 1 FROM sys.extended_properties WHERE major_id = OBJECT_ID(N'ventas.producto') AND minor_id = 0 AND name = N'MS_Description')
  EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Combustibles y productos de tienda',
    @level0type = N'SCHEMA', @level0name = N'ventas', @level1type = N'TABLE', @level1name = N'producto';
GO

IF NOT EXISTS (SELECT 1 FROM sys.extended_properties WHERE major_id = OBJECT_ID(N'ventas.venta') AND minor_id = 0 AND name = N'MS_Description')
  EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Venta registrada en una estación',
    @level0type = N'SCHEMA', @level0name = N'ventas', @level1type = N'TABLE', @level1name = N'venta';
GO

IF NOT EXISTS (SELECT 1 FROM sys.extended_properties WHERE major_id = OBJECT_ID(N'ventas.venta_pago') AND minor_id = 0 AND name = N'MS_Description')
  EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Medios de pago de la venta',
    @level0type = N'SCHEMA', @level0name = N'ventas', @level1type = N'TABLE', @level1name = N'venta_pago';
GO

IF NOT EXISTS (SELECT 1 FROM sys.extended_properties WHERE major_id = OBJECT_ID(N'terceros.tercero') AND minor_id = 0 AND name = N'MS_Description')
  EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Persona natural o jurídica',
    @level0type = N'SCHEMA', @level0name = N'terceros', @level1type = N'TABLE', @level1name = N'tercero';
GO

IF NOT EXISTS (SELECT 1 FROM sys.extended_properties WHERE major_id = OBJECT_ID(N'terceros.vehiculo') AND minor_id = 0 AND name = N'MS_Description')
  EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Vehículos asociados a un cliente (flotas)',
    @level0type = N'SCHEMA', @level0name = N'terceros', @level1type = N'TABLE', @level1name = N'vehiculo';
GO

IF NOT EXISTS (SELECT 1 FROM sys.extended_properties WHERE major_id = OBJECT_ID(N'facturacion.resolucion') AND minor_id = 0 AND name = N'MS_Description')
  EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Resolución de numeración DIAN',
    @level0type = N'SCHEMA', @level0name = N'facturacion', @level1type = N'TABLE', @level1name = N'resolucion';
GO

IF NOT EXISTS (SELECT 1 FROM sys.extended_properties WHERE major_id = OBJECT_ID(N'facturacion.factura') AND minor_id = 0 AND name = N'MS_Description')
  EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Factura electrónica emitida por venta',
    @level0type = N'SCHEMA', @level0name = N'facturacion', @level1type = N'TABLE', @level1name = N'factura';
GO
