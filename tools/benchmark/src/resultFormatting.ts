/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import Table from "easy-table";
import chalk from "chalk";

/**
 * Library for converting a `Record<string, unknown>` into formatted table cells.
 * In the future this library can be used to provide extensible formatting for customized benchmarks which report different fields.
 */

/**
 * How to format specific well known data.
 */
export interface ExpectedCell {
	key: string;
	cell(table: Table, data: Record<string, unknown>);
}

export function numberCell(key: string, title: string, f: (v: number) => string) {
	return {
		key,
		cell: (table, data) => {
			const field = data[key];
			const content =
				typeof field === "number" ? f(field) : chalk.red(`Expected number got "${field}"`);
			table.cell(title, content, Table.padLeft);
		},
	};
}

export function stringCell(key: string, title: string, f: (s: string) => string) {
	return {
		key,
		cell: (table, data) => {
			const field = data[key];
			const content =
				typeof field === "string" ? f(field) : chalk.red(`Expected string got "${field}"`);
			table.cell(title, content);
		},
	};
}

export function arrayCell(key: string, title: string, f: (a: unknown[]) => string) {
	return {
		key,
		cell: (table, data) => {
			const field = data[key];
			const content = Array.isArray(field)
				? f(field)
				: chalk.red(`Expected array got "${field}"`);
			table.cell(title, content);
		},
	};
}

export function objectCell(key: string, title: string, f: (a: object) => string) {
	return {
		key,
		cell: (table, data) => {
			const field = data[key];
			const content =
				typeof field === "object" ? f(field) : chalk.red(`Expected object got "${field}"`);
			table.cell(title, content);
		},
	};
}

export function skipCell(key: string) {
	return { key, cell: () => {} };
}

export function addCells(
	table: Table,
	data: Record<string, unknown>,
	expected: readonly ExpectedCell[],
): void {
	const keys = new Set(Object.getOwnPropertyNames(data));
	// Add expected cells, with their custom formatting and canonical order
	for (const cell of expected) {
		if (keys.delete(cell.key)) {
			cell.cell(table, data);
		}
	}

	// Add extra cells
	for (const key of keys) {
		table.cell(key, data[key]);
	}
}
