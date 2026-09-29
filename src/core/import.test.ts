import { describe, expect, it } from 'vitest'
import { ddlToDbml } from './import.ts'
import { buildProjectModel } from './model.ts'

describe('ddlToDbml (RF-82)', () => {
  it('convierte DDL de SQL Server a DBML que parsea, con increment y FKs', () => {
    const dbml = ddlToDbml(`CREATE TABLE [dbo].[Ventas] (
  [Id] bigint IDENTITY(1,1) NOT NULL PRIMARY KEY,
  [ClienteId] int NULL,
  [Total] decimal(18,2) NOT NULL DEFAULT 0
);
CREATE TABLE dbo.Clientes (Id int NOT NULL PRIMARY KEY, Nombre nvarchar(100));
ALTER TABLE dbo.Ventas ADD CONSTRAINT FK_V_C FOREIGN KEY (ClienteId) REFERENCES dbo.Clientes(Id);`)
    expect(dbml).toMatch(/"Id" bigint \[increment, pk, not null\]/)
    const { model, errors } = buildProjectModel([{ id: 's', slug: '00-legado', position: 1, files: { model: dbml, mongo: '' } }])
    expect(errors).toEqual([])
    expect(model!.tables.map((t) => t.key).sort()).toEqual(['dbo.Clientes', 'dbo.Ventas'])
    expect(model!.tables.find((t) => t.key === 'dbo.Ventas')!.columns[0]).toMatchObject({ increment: true, pk: true })
    expect(model!.relations).toHaveLength(1)
  })
})
