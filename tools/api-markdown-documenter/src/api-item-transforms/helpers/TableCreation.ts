/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ApiItem } from "@microsoft/api-extractor-model";
import type { AlignType, PhrasingContent, Table, TableCell, TableRow } from "mdast";

/**
 * Options for table creation, given a list of API items.
 */
export interface TableOptions<TApiItem extends ApiItem> {
	/**
	 * The set of columns to be included in the table.
	 */
	readonly columnOptions: readonly ColumnOptions<TApiItem>[];

	/**
	 * Optional content alignment for all columns in the table.
	 *
	 * @remarks Can be overridden on a per-column basis via {@link ColumnOptions.alignment}.
	 */
	readonly alignment?: AlignType;
}

/**
 * Column options for table creation.
 */
export interface ColumnOptions<TApiItem extends ApiItem> {
	/**
	 * The title of the column.
	 */
	readonly title: PhrasingContent;

	/**
	 * The kind of column.
	 * "required" columns will always be generated, even if none of the cells are populated.
	 * "optional" columns will only be generated if at least one cell is populated.
	 */
	readonly columnKind: "required" | "optional";

	/**
	 * Create the table cell content for the specified item.
	 *
	 * @returns The table cell content, if any should be displayed. If `undefined` is returned, the cell will be empty.
	 */
	readonly createCellContent: (item: TApiItem) => TableCell | undefined;

	/**
	 * Optional content alignment for the column.
	 *
	 * @remarks Overrides {@link TableOptions.alignment}. If not specified, defaults to {@link TableOptions.alignment}.
	 */
	readonly alignment?: AlignType;
}

const emptyCell: TableCell = { type: "tableCell", children: [] };

/**
 * Creates a table from a list of API items.
 */
export function createTableForApiItems<TApiItem extends ApiItem>(
	items: readonly TApiItem[],
	options: TableOptions<TApiItem>,
): Table {
	const { columnOptions, alignment } = options;

	// Build up the table contents as a 2d array of cells.
	// We will use this representation to potentially omit optional columns that have no content.
	const tableCells: (TableCell | undefined)[][] = [];
	for (const item of items) {
		const currentRow: (TableCell | undefined)[] = [];
		for (const curentColumnOptions of columnOptions) {
			currentRow.push(curentColumnOptions.createCellContent(item));
		}
		tableCells.push(currentRow);
	}

	// Determine which columns should be kept in the final table.
	const includedColumnIndices: number[] = [];
	for (let iColumn = 0; iColumn < columnOptions.length; iColumn++) {
		const currentColumnOptions = columnOptions[iColumn];
		if (currentColumnOptions.columnKind === "required") {
			// Required columns are always included.
			includedColumnIndices.push(iColumn);
		} else {
			// Optional columns are only included if at least one cell has content.
			let hasContent = false;
			for (const row of tableCells) {
				const currentCell = row[iColumn];
				if (currentCell !== undefined && currentCell.children.length > 0) {
					hasContent = true;
					break;
				}
			}
			if (hasContent) {
				includedColumnIndices.push(iColumn);
			}
		}
	}

	// Create the header row
	const headerRow: TableRow = {
		type: "tableRow",
		children: includedColumnIndices.map((iColumn) => ({
			type: "tableCell",
			children: [columnOptions[iColumn].title],
		})),
	};

	// Create the data rows
	const rows: TableRow[] = [];
	for (const rowCells of tableCells) {
		const row: TableRow = {
			type: "tableRow",
			children: includedColumnIndices.map((iColumn) => rowCells[iColumn] ?? emptyCell),
		};
		rows.push(row);
	}

	// Create alignment array
	const align: AlignType[] = includedColumnIndices.map(
		(iColumn) =>
			// eslint-disable-next-line unicorn/no-null -- mdast uses null to not specify alignment
			columnOptions[iColumn].alignment ?? alignment ?? null,
	);

	return {
		type: "table",
		align,
		children: [headerRow, ...rows],
	} satisfies Table;
}
