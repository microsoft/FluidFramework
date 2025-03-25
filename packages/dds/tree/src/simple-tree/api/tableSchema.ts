/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { oob } from "@fluidframework/core-utils/internal";
import { Tree } from "../../shared-tree/index.js";
import { TreeArrayNode } from "../arrayNode.js";
import {
	// TODO: create and export SystemTypes to replace "InternalExports"
	// eslint-disable-next-line import/no-deprecated, @typescript-eslint/no-unused-vars, unused-imports/no-unused-imports
	typeNameSymbol,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars, unused-imports/no-unused-imports
	typeSchemaSymbol,
	type TreeNodeSchema,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars, unused-imports/no-unused-imports
	type TreeNodeSchemaClass,
} from "../core/index.js";
import type {
	InsertableTreeNodeFromImplicitAllowedTypes,
	TreeNodeFromImplicitAllowedTypes,
} from "../schemaTypes.js";
import type { SchemaFactory } from "./schemaFactory.js";

// Schema is defined using a factory object that generates classes for objects as well
// as list and map nodes.

export interface CellKey {
	readonly columnId: string;
	readonly rowId: string;
}

export interface IColumn {
	readonly index: number;
	readonly moveTo: (index: number) => void;
}

export interface IRow<TCell extends readonly TreeNodeSchema[], TColumn extends IColumn> {
	readonly index: number;
	readonly getCell: (column: TColumn) => TreeNodeFromImplicitAllowedTypes<TCell> | undefined;
	readonly setCell: (
		column: TColumn,
		value: InsertableTreeNodeFromImplicitAllowedTypes<TCell> | undefined,
	) => void;
	readonly deleteCell: (column: TColumn) => void;
	readonly moveTo: (index: number) => void;
}

/**
 * @system
 */
export interface InsertRowsParameters<
	TCell extends readonly TreeNodeSchema[],
	TColumn extends IColumn,
	TRow extends IRow<TCell, TColumn>,
> {
	/**
	 * The index at which to insert the new rows.
	 * @remarks If not provided, the rows will be appended to the end of the table.
	 */
	// TODO: document bounds policy
	readonly index?: number | undefined;
	// TODO: insertable type
	readonly rows: TRow[];
}

export interface InsertColumnParameters<TColumn extends IColumn> {
	/**
	 * The index at which to insert the new column.
	 * @remarks If not provided, the column will be appended to the end of the table.
	 */
	// TODO: document bounds policy
	readonly index: number;
	// TODO: insertable type
	readonly column: TColumn;
}

export interface ITable<
	TCell extends readonly TreeNodeSchema[],
	TColumn extends IColumn,
	TRow extends IRow<TCell, TColumn>,
> {
	readonly getRow: (id: string) => TRow | undefined;
	readonly getColumn: (id: string) => TColumn | undefined;
	readonly getCell: (key: CellKey) => TreeNodeFromImplicitAllowedTypes<TCell> | undefined;

	readonly insertRows: (parameters: InsertRowsParameters<TCell, TColumn, TRow>) => TRow[];
	readonly deleteRows: (rows: readonly TRow[]) => void;
	// TODO: is this needed?
	readonly deleteAllRows: () => void;

	readonly insertColumn: (parameters: InsertColumnParameters<TColumn>) => TColumn;
	// TODO: currently does not delete cells - can it? should it?
	readonly removeColumn: (column: TColumn) => void;

	// TODO: would cell insertion at this level be useful?
}

export interface TableSchemaProps<
	TCell extends readonly TreeNodeSchema[],
	TColumnProps extends readonly TreeNodeSchema[],
	TRowProps extends readonly TreeNodeSchema[],
	Scope extends string | undefined,
> {
	readonly sf: SchemaFactory<Scope>;
	readonly schemaTypes: TCell;
	readonly columnProps?: TColumnProps;
	readonly rowProps?: TRowProps;
}

/**
 * TODO
 * @alpha
 */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type -- Return type is too complex to be reasonable to specify
export function createTableSchema<
	const TCell extends readonly TreeNodeSchema[],
	const TColumnProps extends readonly TreeNodeSchema[],
	const TRowProps extends readonly TreeNodeSchema[],
	const TScope extends string | undefined,
>(props: TableSchemaProps<TCell, TColumnProps, TRowProps, TScope>) {
	const { sf, schemaTypes, columnProps, rowProps } = props;

	type CellValueType = TreeNodeFromImplicitAllowedTypes<TCell>;
	type CellInsertableType = InsertableTreeNodeFromImplicitAllowedTypes<TCell>;

	/**
	 * Get the parent table of the provided row.
	 * @throws Throws an error if the row is not in a table.
	 */
	function getTableParentOfRow(row: Row): Table {
		const parent = Tree.parent(row);
		if (parent) {
			const grandparent = Tree.parent(parent);
			if (grandparent instanceof Table) {
				return grandparent as Table;
			}
		}
		throw new Error("Row is not in a table");
	}

	/**
	 * The Row schema - this is a map of Cells where the key is the column id
	 */
	class Row
		extends sf.object("Row", {
			id: sf.identifier,
			_cells: sf.map(schemaTypes), // The keys of this map are the column ids - this would ideally be private
			props: rowProps ?? sf.null,
		})
		implements IRow<TCell, Column>
	{
		/** Get a cell by the column
		 * @param column - The column
		 * @returns The cell if it exists, otherwise undefined
		 */
		public getCell(column: Column): CellValueType | undefined {
			return this._cells.get(column.id) as CellValueType | undefined;
		}

		/**
		 * Set the value of a cell in the row
		 * @param column - The column
		 * @param value - The value to set
		 */
		public setCell(column: Column, value: CellInsertableType | undefined): void {
			this._cells.set(column.id, value);
		}

		/**
		 * Delete a cell from the row
		 * @param column - The column
		 */
		public deleteCell(column: Column): void {
			if (!this._cells.has(column.id)) return;
			this._cells.delete(column.id);
		}

		/**
		 * Move a row to a new location
		 * @param index - The index to move the row to
		 */
		public moveTo(index: number): void {
			const rows = getTableParentOfRow(this).rows;

			// If the index is greater than the current index, move it to the right
			const adjustedIndex = index > this.index ? index + 1 : index;

			// Make sure the index is within the bounds of the table
			if (adjustedIndex < 0 && this.index > 0) {
				rows.moveToStart(this.index);
				return;
			}
			if (adjustedIndex > rows.length - 1 && this.index < rows.length - 1) {
				rows.moveToEnd(this.index);
				return;
			}
			if (adjustedIndex < 0 || index >= rows.length) {
				return; // If the index is out of bounds, do nothing
			}
			rows.moveToIndex(adjustedIndex, this.index);
		}

		/**
		 * Get the index of the row in the table
		 * @returns The index of the row in the table
		 */
		public get index(): number {
			const rows = getTableParentOfRow(this).rows;
			return rows.indexOf(this);
		}
	}

	/**
	 * Get the parent table of the provided column.
	 * @throws Throws an error if the column is not in a table.
	 */
	function getTableParentOfColumn(column: Column): Table {
		const parent = Tree.parent(column);
		if (parent !== undefined) {
			const grandparent = Tree.parent(parent);
			if (grandparent instanceof Table) {
				return grandparent as Table;
			}
		}
		throw new Error("Column is not in a table");
	}

	/**
	 * The Column schema - this can include more properties as needed *
	 */
	class Column
		extends sf.object("Column", {
			id: sf.identifier,
			props: columnProps ?? sf.null,
		})
		implements IColumn
	{
		/**
		 * Get the index of the column in the table
		 * @returns The index of the column in the table
		 */
		public get index(): number {
			const columns = getTableParentOfColumn(this).columns;
			if (columns !== undefined) {
				return columns.indexOf(this);
			}
			throw new Error("Column is not in a table");
		}

		/**
		 * Move a column to a new location
		 * @param index - The index to move the column to
		 */
		public moveTo(index: number): void {
			const columns = getTableParentOfColumn(this).columns;

			// If the index is greater than the current index, move it to the right
			const adjustedIndex = index > this.index ? index + 1 : index;

			// Make sure the index is within the bounds of the table
			if (adjustedIndex < 0 && this.index > 0) {
				columns.moveToStart(this.index);
				return;
			}
			if (adjustedIndex > columns.length - 1 && this.index < columns.length - 1) {
				columns.moveToEnd(this.index);
				return;
			}
			if (adjustedIndex < 0 || adjustedIndex >= columns.length) {
				// TODO: what do array nodes do in this case? We should probably do the same here.
				return; // If the index is out of bounds, do nothing
			}
			columns.moveToIndex(adjustedIndex, this.index);
		}
	}

	/**
	 * The Table schema
	 */
	class Table
		extends sf.object("Table", {
			rows: sf.array(Row),
			columns: sf.array(Column),
		})
		implements ITable<TCell, Column, Row>
	{
		/**
		 * Get a row by the id
		 * @param id - The id of the row
		 */
		public getRow(id: string): Row | undefined {
			return this.rows.find((_row) => _row.id === id);
		}

		/**
		 * Get a cell by its "key" in the table.
		 * @param key - A key that uniquely distinguishes a cell in the table, represented as a combination of the column ID and row ID.
		 */
		public getCell(key: CellKey): CellValueType | undefined {
			const { columnId, rowId } = key;
			const row = this.getRow(rowId);
			if (row !== undefined) {
				const column = this.getColumn(columnId);
				if (column !== undefined) {
					return row.getCell(column);
				}
			}
			// If the cell does not exist return undefined
			return undefined;
		}

		/**
		 * Insert a row at a specific location
		 * @param index - The index to insert the row at
		 * @param rows - The rows to insert
		 * If no rows are provided, a new row will be created.
		 */
		public insertRows({ index, rows }: InsertRowsParameters<TCell, Column, Row>): Row[] {
			if (index === undefined) {
				this.rows.insertAtEnd(TreeArrayNode.spread(rows));
			} else {
				this.rows.insertAt(index, TreeArrayNode.spread(rows));
			}
			return rows;
		}

		/**
		 * Delete a row from the table
		 * @param rows - The rows to delete
		 */
		public deleteRows(rows: readonly Row[]): void {
			// If there are no rows to delete, do nothing
			if (rows.length === 0) return;
			// If there is only one row to delete, delete it
			if (rows.length === 1) {
				const index = this.rows.indexOf(rows[0] ?? oob());
				this.rows.removeAt(index);
				return;
			}
			// If there are multiple rows to delete, delete them in a transaction
			// This is to avoid the performance issues of deleting multiple rows at once
			Tree.runTransaction(this, () => {
				// Iterate over the rows and delete them
				for (const row of rows) {
					const index = this.rows.indexOf(row);
					this.rows.removeAt(index);
				}
			});
		}

		/**
		 * Delete all rows from the table
		 */
		public deleteAllRows(): void {
			this.rows.removeRange();
		}

		/**
		 * Insert a new column at a specific location
		 * @param index - The index to insert the column at
		 * @param name - The name of the column
		 */
		public insertColumn({ index, column }: InsertColumnParameters<Column>): Column {
			this.columns.insertAt(index, column);
			return column;
		}

		/**
		 * Get a column by the id
		 * @param id - The id of the column
		 */
		public getColumn(id: string): Column | undefined {
			return this.columns.find((column) => column.id === id);
		}

		/**
		 * Delete a column header/object from the table
		 * DOES NOT DELETE THE CELLS IN THE ROWS
		 * @param column - The column to delete
		 */
		public removeColumn(column: Column): void {
			const index = this.columns.indexOf(column);
			// If the column is not in the table, do nothing
			if (index === -1) return;
			this.columns.removeAt(index);
		}
	}

	// Return the table schema
	return Table;
}
