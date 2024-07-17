/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import chalk from "chalk";
import Table from "easy-table";

/**
 * Library for converting a `Record<string, unknown>` into formatted table cells.
 * In the future this library can be used to provide extensible formatting for customized benchmarks which report different fields.
 */

/**
 * How to format specific well known data.
 */
export interface ExpectedCell {
	key: string;
	cell(table: Table, data: Record<string, unknown>): void;
}

export function numberCell(key: string, title: string, f: (v: number) => string): ExpectedCell {
	return {
		key,
		cell: (table, data): void => {
			const field = data[key];
			const content =
				typeof field === "number" ? f(field) : chalk.red(`Expected number got "${field}"`);
			table.cell(title, content, Table.padLeft);
		},
	};
}

export function stringCell(key: string, title: string, f: (s: string) => string): ExpectedCell {
	return {
		key,
		cell: (table, data): void => {
			const field = data[key];
			const content =
				typeof field === "string" ? f(field) : chalk.red(`Expected string got "${field}"`);
			table.cell(title, content);
		},
	};
}

export function arrayCell(key: string, title: string, f: (a: unknown[]) => string): ExpectedCell {
	return {
		key,
		cell: (table, data): void => {
			const field = data[key];
			const content = Array.isArray(field)
				? f(field)
				: chalk.red(`Expected array got "${field}"`);
			table.cell(title, content);
		},
	};
}

export function objectCell(key: string, title: string, f: (a: object) => string): ExpectedCell {
	return {
		key,
		cell: (table, data): void => {
			const field = data[key];
			const content =
				typeof field === "object" && field !== null
					? f(field)
					: chalk.red(`Expected object got "${field}"`);
			table.cell(title, content);
		},
	};
}

export function skipCell(key: string): ExpectedCell {
	return { key, cell: (): void => {} };
}

export function addCells(
	table: Table,
	data: Record<string, unknown>,
	dataFormatter: Record<string, (value: unknown) => string>,
	expected: readonly ExpectedCell[],
): void {
	const keys = new Set(Object.getOwnPropertyNames(data));
	// Add expected cells, with their custom formatting and canonical order
	for (const cell of expected) {
		if (keys.delete(cell.key)) {
			cell.cell(table, data);
		}
	}
	// Add custom data cells
	for (const [key, val] of Object.entries(data)) {
		const displayValue = key in dataFormatter ? dataFormatter[key](val) : (val as string);
		table.cell(key, displayValue, Table.padLeft);
	}
}
