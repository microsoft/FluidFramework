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
	 * Get the date-time
	 */
	get value(): Date {
		return new Date(this.raw);
	}

	/**
	 * Set the raw date-time string
	 */
	set value(value: Date) {
		// Test if the value is a valid date
		if (Number.isNaN(value.getTime())) {
			return;
		}
		this.raw = value.getTime();
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

	// TODO: not sure if userId is neccessary for this example app
	hasVoted(userId: string): boolean {
		return this.votes.has(userId);
	}
}

export class Cell extends schemaFactory.object("table-cell", {
	value: schemaFactory.optional([schemaFactory.string, schemaFactory.boolean, DateTime]),
}) {}

export class ColumnProps extends schemaFactory.object("table-column-props", {
	label: schemaFactory.optional(schemaFactory.string),
	hint: schemaFactory.optional(schemaFactory.string),
}) {}
export class Column extends TableSchema.createColumn(schemaFactory, ColumnProps) {}

export class RowProps extends schemaFactory.object("table-row-props", {
	label: schemaFactory.optional(schemaFactory.string),
}) {}
export class Row extends TableSchema.createRow(schemaFactory, Cell, RowProps) {}

export class Table extends TableSchema.createTable(schemaFactory, Cell, Column, Row) {}
