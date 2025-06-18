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

export const Cell = [schemaFactory.string, schemaFactory.boolean, DateTime] as const;

export class Column extends TableSchema.column({
	schemaFactory,
	cell: Cell,
	props: schemaFactory.object("table-column-props", {
		label: schemaFactory.optional(schemaFactory.string),
		hint: schemaFactory.optional(schemaFactory.string),
	}),
}) {}
export class Row extends TableSchema.row({
	schemaFactory,
	cell: Cell,
	props: schemaFactory.object("table-row-props", {
		label: schemaFactory.optional(schemaFactory.string),
	}),
}) {}

export class Table extends TableSchema.table({
	schemaFactory,
	cell: Cell,
	column: Column,
	row: Row,
}) {}
