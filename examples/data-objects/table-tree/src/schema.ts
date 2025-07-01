/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// eslint-disable-next-line import/no-internal-modules
import { SchemaFactoryAlpha, TableSchema } from "@fluidframework/tree/internal";

const schemaFactory = new SchemaFactoryAlpha("tree-table");

/**
 * A node representing date and time information.
 * Uses javascript's {@link Date} type to represent the date.
 */
export class DateTime extends schemaFactory.object("DateTime", {
	raw: schemaFactory.number,
}) {
	/**
	 * Converts a JavaScript `Date` object to a `DateTime` instance.
	 * @param date - A valid JavaScript Date.
	 * @returns A new `DateTime` instance.
	 */
	static fromDate(date: Date): DateTime {
		const dt = new DateTime({ raw: date.getTime() });
		dt.value = date;
		return dt;
	}

	/**
	 * Get the date-time
	 */
	get value(): Date {
		return new Date(this.raw);
	}

	/**
	 * Set the raw date-time string
	 */
	set value(value: Date) {
		const newRaw = value.getTime();
		// Test if the value is a valid date
		if (Number.isNaN(newRaw)) {
			throw new TypeError("Date is an invalid type.");
		}
		this.raw = newRaw;
	}
}

/**
 * The kinds of cells allowed in the table.
 */
export const Cell = [schemaFactory.string, schemaFactory.boolean, DateTime] as const;

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
