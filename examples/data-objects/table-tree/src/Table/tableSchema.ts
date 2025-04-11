/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// eslint-disable-next-line import/no-internal-modules
import { SchemaFactoryAlpha, TableSchema } from "@fluidframework/tree/internal";

const schemaFactory = new SchemaFactoryAlpha("tree-table");
export class Cell extends schemaFactory.object("table-cell", {
	value: schemaFactory.string,
}) {}

export class Column extends TableSchema.createColumn(schemaFactory) {}

export class Row extends TableSchema.createRow(schemaFactory, Cell, Column) {}

export class Table extends TableSchema.createTable(schemaFactory, Cell, Column, Row) {}
