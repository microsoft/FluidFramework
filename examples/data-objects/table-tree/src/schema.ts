/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// eslint-disable-next-line import/no-internal-modules
import { SchemaFactoryAlpha, TableSchema } from "@fluidframework/tree/internal";

const schemaFactory = new SchemaFactoryAlpha("tree-table");

/**
 * The kinds of cells allowed in the table.
 */
export const Cell = schemaFactory.string;

/**
 * {@link Column} properties.
 */
export class ColumnProps extends schemaFactory.object("table-column-props", {
	/**
	 * Column label.
	 */
	label: schemaFactory.optional(schemaFactory.string),

	/**
	 * Type hint. Can be used to determine how the cell should be rendered.
	 * For example, it can be "text", "date", or "checkbox".
	 * @defaultValue Plain text.
	 */
	hint: schemaFactory.optional(schemaFactory.string),
}) {}

/**
 * A column in the table.
 */
export class Column extends TableSchema.column({
	schemaFactory,
	cell: Cell,
	props: ColumnProps,
}) {}

/**
 * A row in the table.
 */
export class Row extends TableSchema.row({
	schemaFactory,
	cell: Cell,
}) {}

export class Table extends TableSchema.table({
	schemaFactory,
	cell: Cell,
	column: Column,
	row: Row,
}) {}
