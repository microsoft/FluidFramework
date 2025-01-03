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
			const field: unknown = data[key];
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
			const field: unknown = data[key];
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
			const field: unknown = data[key];
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
			const field: unknown = data[key];
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
