/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	SchemaFactoryAlpha,
	// eslint-disable-next-line import/no-internal-modules
} from "@fluidframework/tree/internal";

// eslint-disable-next-line eslint-comments/disable-enable-pair
/* eslint-disable jsdoc/require-jsdoc */

const sf = new SchemaFactoryAlpha("com.microsoft.fluid.tree-agent.table");

export class Cell extends sf.object(
	"Cell",
	{
		identifier: sf.identifier,
		content: sf.optional([sf.string, sf.number, sf.boolean], {
			metadata: {
				description: "The content of the cell, or undefined if the cell is empty/blank",
			},
		}),
	},
	{
		metadata: { description: "A cell in a row of a table" },
	},
) {}

export class Row extends sf.object(
	"Row",
	{
		identifier: sf.identifier,
		cells: sf.required(sf.array(Cell), {
			metadata: {
				description:
					"The cells in this row, in order. There must be as many cells as there are columns in the table",
			},
		}),
	},
	{
		metadata: { description: "A row in a table" },
	},
) {}

export class Table extends sf.object(
	"Table",
	{
		identifier: sf.identifier,
		rows: sf.required(sf.array(Row), {
			metadata: {
				description: "The rows in the table, in order",
			},
		}),
		columns: sf.required(sf.array(sf.string), {
			metadata: {
				description: "The names of the columns in the table, in order",
			},
		}),
	},
	{ metadata: { description: "A table of structured data" } },
) {}

export function stringifyTable(table: Table): string {
	if (table.columns.length === 0) {
		return "Empty table";
	}

	const headerRow = `| ${table.columns.join(" | ")} |`;
	const separatorRow = `| ${table.columns.map(() => "---").join(" | ")} |`;
	const dataRows = table.rows.map((row) => {
		return `| ${row.cells.map((cell) => (cell.content === undefined ? "" : String(cell.content))).join(" | ")} |`;
	});

	return [headerRow, separatorRow, ...dataRows].join("\n");
}
