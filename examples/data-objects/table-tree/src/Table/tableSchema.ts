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
 * A SharedTree object that allows users to vote
 */
export class Vote extends schemaFactory.object("Vote", {
	votes: schemaFactory.map("votes", schemaFactory.string), // Map of votes
}) {
	addVote(vote: string): void {
		if (this.votes.has(vote) === true) {
			return;
		}
		this.votes.set(vote, "");
	}

	removeVote(vote: string): void {
		if (this.votes.has(vote) === false) {
			return;
		}
		this.votes.delete(vote);
	}

	/**
	 * Toggle a vote in the map of votes
	 */
	toggleVote(vote: string): void {
		if (this.votes.has(vote) === true) {
			this.removeVote(vote);
		} else {
			this.addVote(vote);
		}
	}

	get numberOfVotes(): number {
		return this.votes.size;
	}

	// TODO: not sure if userId is necessary for this example app
	hasVoted(userId: string): boolean {
		return this.votes.has(userId);
	}
}

export class Cell extends schemaFactory.object("table-cell", {
	value: schemaFactory.optional([schemaFactory.string, schemaFactory.boolean, DateTime]),
}) {}

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
