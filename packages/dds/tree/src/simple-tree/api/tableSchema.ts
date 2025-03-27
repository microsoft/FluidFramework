/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { oob } from "@fluidframework/core-utils/internal";
import { Tree } from "../../shared-tree/index.js";
import { TreeArrayNode } from "../arrayNode.js";
import type {
	// TODO: create and export SystemTypes to replace "InternalExports"
	// eslint-disable-next-line import/no-deprecated, @typescript-eslint/no-unused-vars, unused-imports/no-unused-imports
	typeNameSymbol,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars, unused-imports/no-unused-imports
	typeSchemaSymbol,
	NodeKind,
	TreeNode,
	TreeNodeSchema,
	TreeNodeSchemaClass,
	WithType,
} from "../core/index.js";
import type {
	InsertableTreeNodeFromImplicitAllowedTypes,
	TreeNodeFromImplicitAllowedTypes,
} from "../schemaTypes.js";
import type { SchemaFactory, ScopedSchemaName } from "./schemaFactory.js";
import type { InsertableObjectFromSchemaRecord } from "../objectNode.js";

// TODOs
// - Explore options for hiding various system types below.
//   Most likely need to be exported, but we can probably hide them in a namespace.

/**
 * A key to uniquely identify a cell in a {@link ITable}.
 * @alpha @sealed
 */
export interface CellKey {
	/**
	 * {@link IColumn.id} of the containing {@link IColumn}.
	 */
	readonly columnId: string;

	/**
	 * {@link IColumn.id} of the containing {@link IColumn}.
	 */
	readonly rowId: string;
}

/**
 * A column in a {@link Table}.
 * @alpha @sealed @system
 */
export interface IColumn {
	readonly id: string;
	readonly index: number;
	readonly moveTo: (index: number) => void;
}

/**
 * A row in a {@link Table}.
 * @alpha @sealed @system
 */
export interface IRow<TCellValue, TCellInsertable, TColumn extends IColumn> {
	readonly id: string;
	readonly index: number;

	// TODO: also allow column ID
	readonly getCell: (column: TColumn) => TCellValue | undefined;

	// TODO: also allow column ID
	readonly setCell: (column: TColumn, value: TCellInsertable | undefined) => void;

	// TODO: also allow column ID
	readonly deleteCell: (column: TColumn) => void;
	readonly moveTo: (index: number) => void;
}

/**
 *
 * @alpha @sealed @system
 */
export interface InsertRowsParameters<TInsertableRow> {
	/**
	 * The index at which to insert the new rows.
	 * @remarks If not provided, the rows will be appended to the end of the table.
	 */
	// TODO: document bounds policy
	readonly index?: number | undefined;

	/**
	 * The rows to insert.
	 */
	readonly rows: TInsertableRow[];
}

/**
 * @sealed
 * @system
 */
export interface InsertColumnParameters<TInsertableColumn> {
	/**
	 * The index at which to insert the new column.
	 * @remarks If not provided, the column will be appended to the end of the table.
	 */
	// TODO: document bounds policy
	readonly index?: number | undefined;

	/**
	 * The column to insert.
	 */
	readonly column: TInsertableColumn;
}

/**
 * A table of rows and columns.
 * @alpha @sealed @system
 */
export interface ITable<
	TCellValue,
	TCellInsertable,
	TColumnValue extends IColumn,
	TColumnInsertable,
	TRowValue extends IRow<TCellValue, TCellInsertable, TColumnValue>,
	TRowInsertable,
> {
	readonly getRow: (id: string) => TRowValue | undefined;
	readonly getColumn: (id: string) => TColumnValue | undefined;
	readonly getCell: (key: CellKey) => TCellValue | undefined;

	readonly insertRows: (parameters: InsertRowsParameters<TRowInsertable>) => TRowValue[];
	readonly deleteRows: (rows: readonly TRowValue[]) => void;
	// TODO: is this needed?
	readonly deleteAllRows: () => void;

	readonly insertColumn: (
		parameters: InsertColumnParameters<TColumnInsertable>,
	) => TColumnValue;
	// TODO: currently does not delete cells - can it? should it?
	readonly removeColumn: (column: TColumnValue) => void;

	// TODO: would cell insertion at this level be useful?
}

/**
 * {@link createTableSchema} input parameters.
 * @alpha @sealed
 */
export interface CreateTableSchemaParameters<
	TCell extends readonly TreeNodeSchema[],
	TColumnProps extends readonly TreeNodeSchema[],
	TRowProps extends readonly TreeNodeSchema[],
	Scope extends string | undefined,
> {
	// TODO: rename: "schemaFactory"
	readonly sf: SchemaFactory<Scope>;
	// TODO: rename: "cellTypes"
	readonly schemaTypes: TCell;

	// TODO: make props optional
	readonly columnProps: TColumnProps;
	readonly rowProps: TRowProps;
}

/**
 * TODO
 * @alpha
 */
// TODO: record-like type parameters
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type -- Return type is too complex to be reasonable to specify
export function createTableSchema<
	const TCell extends readonly TreeNodeSchema[],
	const TColumnProps extends readonly TreeNodeSchema[],
	const TRowProps extends readonly TreeNodeSchema[],
	const TScope extends string | undefined,
>(props: CreateTableSchemaParameters<TCell, TColumnProps, TRowProps, TScope>) {
	const { sf, schemaTypes, columnProps, rowProps } = props;

	type CellValueType = TreeNodeFromImplicitAllowedTypes<TCell>;
	type CellInsertableType = InsertableTreeNodeFromImplicitAllowedTypes<TCell>;

	// #region Column type

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
	 * {@link Column} fields.
	 * @remarks Extracted for re-use in returned type signature defined later in this function.
	 * The implicit typing is intentional.
	 */
	const columnFields = {
		id: sf.identifier,
		props: columnProps,
	};

	/**
	 * The Column schema - this can include more properties as needed *
	 */
	class Column extends sf.object("Column", columnFields) implements IColumn {
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

	type ColumnValueType = TreeNode & IColumn & WithType<ScopedSchemaName<TScope, "Column">>;
	type ColumnInsertableType = InsertableObjectFromSchemaRecord<typeof columnFields>;

	// Returning SingletonSchema without a type conversion results in TypeScript generating something like `readonly "__#124291@#brand": unknown;`
	// for the private brand field of TreeNode.
	// This numeric id doesn't seem to be stable over incremental builds, and thus causes diffs in the API extractor reports.
	// This is avoided by doing this type conversion.
	// The conversion is done via assignment instead of `as` to get stronger type safety.
	const ColumnSchemaType: TreeNodeSchemaClass<
		/* Name */ ScopedSchemaName<TScope, "Column">,
		/* Kind */ NodeKind.Object,
		/* TNode */ ColumnValueType,
		/* TInsertable */ object & ColumnInsertableType,
		/* ImplicitlyConstructable */ true,
		/* Info */ typeof columnFields
	> = Column;

	// #endregion

	// #region Row type

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
	 * {@link Row} fields.
	 * @remarks Extracted for re-use in returned type signature defined later in this function.
	 * The implicit typing is intentional.
	 */
	const rowFields = {
		id: sf.identifier,
		// The keys of this map are the column ids - this would ideally be private
		_cells: sf.map(schemaTypes),
		props: rowProps,
	};

	/**
	 * The Row schema - this is a map of Cells where the key is the column id
	 */
	class Row
		extends sf.object("Row", rowFields)
		implements IRow<CellValueType, CellInsertableType, ColumnValueType>
	{
		/** Get a cell by the column
		 * @param column - The column
		 * @returns The cell if it exists, otherwise undefined
		 */
		public getCell(column: ColumnValueType): CellValueType | undefined {
			return this._cells.get(column.id) as CellValueType | undefined;
		}

		/**
		 * Set the value of a cell in the row
		 * @param column - The column
		 * @param value - The value to set
		 */
		public setCell(column: ColumnValueType, value: CellInsertableType | undefined): void {
			this._cells.set(column.id, value);
		}

		/**
		 * Delete a cell from the row
		 * @param column - The column
		 */
		public deleteCell(column: ColumnValueType): void {
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

	type RowValueType = TreeNode &
		IRow<CellValueType, CellInsertableType, ColumnValueType> &
		WithType<ScopedSchemaName<TScope, "Row">>;
	// TODO: hide cells?
	type RowInsertableType = InsertableObjectFromSchemaRecord<typeof rowFields>;

	// Returning SingletonSchema without a type conversion results in TypeScript generating something like `readonly "__#124291@#brand": unknown;`
	// for the private brand field of TreeNode.
	// This numeric id doesn't seem to be stable over incremental builds, and thus causes diffs in the API extractor reports.
	// This is avoided by doing this type conversion.
	// The conversion is done via assignment instead of `as` to get stronger type safety.
	const RowSchemaType: TreeNodeSchemaClass<
		/* Name */ ScopedSchemaName<TScope, "Row">,
		/* Kind */ NodeKind.Object,
		/* TNode */ RowValueType,
		/* TInsertable */ object & RowInsertableType,
		/* ImplicitlyConstructable */ true,
		/* Info */ typeof rowFields
	> = Row;

	// #endregion

	/**
	 * {@link Table} fields.
	 * @remarks Extracted for re-use in returned type signature defined later in this function.
	 * The implicit typing is intentional.
	 */
	const tableFields = {
		rows: sf.array(RowSchemaType),
		columns: sf.array(ColumnSchemaType),
	};

	/**
	 * The Table schema
	 */
	class Table
		extends sf.object("Table", tableFields)
		implements
			ITable<
				CellValueType,
				CellInsertableType,
				ColumnValueType,
				ColumnInsertableType,
				RowValueType,
				RowInsertableType
			>
	{
		/**
		 * Get a row by the id
		 * @param id - The id of the row
		 */
		public getRow(id: string): RowValueType | undefined {
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
		public insertRows({
			index,
			rows,
		}: InsertRowsParameters<RowInsertableType>): RowValueType[] {
			if (index === undefined) {
				this.rows.insertAtEnd(TreeArrayNode.spread(rows));
			} else {
				this.rows.insertAt(index, TreeArrayNode.spread(rows));
			}

			// TODO: verify this
			// Inserting the input nodes into the tree hydrates them, making them usable as nodes.
			return rows as RowValueType[];
		}

		/**
		 * Delete a row from the table
		 * @param rows - The rows to delete
		 */
		public deleteRows(rows: readonly RowValueType[]): void {
			// If there are no rows to delete, do nothing
			if (rows.length === 0) {
				return;
			}

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
		 * Insert a column at a specific location.
		 */
		public insertColumn({
			column,
			index,
		}: InsertColumnParameters<ColumnInsertableType>): ColumnValueType {
			if (index === undefined) {
				this.columns.insertAtEnd(column);
			} else {
				this.columns.insertAt(index, column);
			}

			// TODO: verify this
			// Inserting the input node into the tree hydrates it, making it usable as a node.
			return column as ColumnValueType;
		}

		/**
		 * Get a column by the id
		 * @param id - The id of the column
		 */
		public getColumn(id: string): ColumnValueType | undefined {
			return this.columns.find((column) => column.id === id);
		}

		/**
		 * Delete a column header/object from the table
		 * DOES NOT DELETE THE CELLS IN THE ROWS
		 * @param column - The column to delete
		 */
		public removeColumn(column: ColumnValueType): void {
			const index = this.columns.indexOf(column);
			// If the column is not in the table, do nothing
			if (index === -1) return;
			this.columns.removeAt(index);
		}
	}

	type TableValueType = TreeNode &
		ITable<
			CellValueType,
			CellInsertableType,
			ColumnValueType,
			ColumnInsertableType,
			RowValueType,
			RowInsertableType
		> &
		WithType<ScopedSchemaName<TScope, "Table">>;
	// TODO: hide rows and columns?
	type TableInsertableType = InsertableObjectFromSchemaRecord<typeof tableFields>;

	// Returning SingletonSchema without a type conversion results in TypeScript generating something like `readonly "__#124291@#brand": unknown;`
	// for the private brand field of TreeNode.
	// This numeric id doesn't seem to be stable over incremental builds, and thus causes diffs in the API extractor reports.
	// This is avoided by doing this type conversion.
	// The conversion is done via assignment instead of `as` to get stronger type safety.
	const TableSchemaType: TreeNodeSchemaClass<
		/* Name */ ScopedSchemaName<TScope, "Table">,
		/* Kind */ NodeKind.Object,
		/* TNode */ TableValueType,
		/* TInsertable */ object & TableInsertableType,
		/* ImplicitlyConstructable */ true,
		/* Info */ typeof tableFields
	> = Table;

	// Return the table schema
	return TableSchemaType;
}
