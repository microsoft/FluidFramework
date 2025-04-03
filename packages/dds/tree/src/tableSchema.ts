/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { oob } from "@fluidframework/core-utils/internal";

import { Tree } from "./shared-tree/index.js";
import {
	type ImplicitAllowedTypes,
	type ImplicitFieldSchema,
	type InsertableObjectFromSchemaRecord,
	type InsertableTreeNodeFromImplicitAllowedTypes,
	type NodeKind,
	type SchemaFactoryAlpha,
	type ScopedSchemaName,
	TreeArrayNode,
	type TreeNode,
	type TreeNodeFromImplicitAllowedTypes,
	type TreeNodeSchemaClass,
	// eslint-disable-next-line import/no-deprecated
	typeNameSymbol,
	typeSchemaSymbol,
	type WithType,
} from "./simple-tree/index.js";

// Future improvement TODOs (ideally to be done before promoting these APIs to `@alpha`):
// - Record-like type parameters
// - Overloads to make Column/Row schema optional when constructing Tables

/**
 * Contains types and factories for creating schema to represent dynamic tabular data.
 * @internal
 */
export namespace TableFactory {
	const tableSchemaFactorySubScope = "table";

	const tableSchemaSymbol: unique symbol = Symbol("Table Schema");

	/**
	 * A key to uniquely identify a cell in a table.
	 * @sealed @internal
	 */
	export interface CellKey {
		/**
		 * {@link TableFactory.IColumn.id} of the containing {@link TableFactory.IColumn}.
		 */
		readonly columnId: string;

		/**
		 * {@link TableFactory.IRow.id} of the containing {@link TableFactory.IRow}.
		 */
		readonly rowId: string;
	}

	/**
	 * {@link TableFactory.ITable.insertRows} parameters.
	 * @sealed @internal
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
	 * {@link TableFactory.ITable.insertColumn} parameters.
	 * @sealed @internal
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
	 * A column in a table.
	 * @sealed @internal
	 */
	export interface IColumn {
		readonly id: string;
		readonly index: number;
		readonly moveTo: (index: number) => void;

		// TODO
	}

	/**
	 * Factory for creating new table column schema.
	 * @internal
	 */
	// eslint-disable-next-line @typescript-eslint/explicit-function-return-type -- Return type is too complex to be reasonable to specify
	export function createColumnSchema<const TInputScope extends string | undefined>(
		inputSchemaFactory: SchemaFactoryAlpha<TInputScope>,
	) {
		const schemaFactory = inputSchemaFactory.scopedFactory(tableSchemaFactorySubScope);
		type Scope = ScopedSchemaName<TInputScope, typeof tableSchemaFactorySubScope>;

		type TTable = TreeNodeFromImplicitAllowedTypes<
			TableSchemaBase<TInputScope, ImplicitAllowedTypes>
		>;

		/**
		 * Get the parent table of the provided column.
		 * @throws Throws an error if the column is not in a table.
		 */
		function getTableParentOfColumn(column: Column): TTable {
			const parent = Tree.parent(column);
			if (parent !== undefined) {
				const grandparent = Tree.parent(parent);
				if (
					grandparent !== undefined &&
					// eslint-disable-next-line @typescript-eslint/no-explicit-any
					(Tree.schema(grandparent) as any)[tableSchemaSymbol] === true
				) {
					return grandparent as TTable;
				}
			}
			throw new Error("Column is not in a table");
		}

		/**
		 * TODO
		 */
		function getColumnList(column: Column): TreeArrayNode<typeof Column> {
			return getTableParentOfColumn(column).columns as unknown as TreeArrayNode<typeof Column>;
		}

		/**
		 * {@link Column} fields.
		 * @remarks Extracted for re-use in returned type signature defined later in this function.
		 * The implicit typing is intentional.
		 */
		const columnFields = {
			id: schemaFactory.identifier,
		} as const satisfies Record<string, ImplicitFieldSchema>;

		/**
		 * The Column schema - this can include more properties as needed *
		 */
		class Column extends schemaFactory.object("Column", columnFields) {
			/**
			 * Get the index of the column in the table
			 * @returns The index of the column in the table
			 */
			public get index(): number {
				const columns = getColumnList(this);
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
				const columns = getColumnList(this);

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

			// #region HACKS

			// eslint-disable-next-line import/no-deprecated, @typescript-eslint/explicit-function-return-type
			public override get [typeNameSymbol]() {
				return super[typeNameSymbol];
			}
			// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
			public get [typeSchemaSymbol]() {
				return super[typeSchemaSymbol];
			}

			// #endregion
		}

		// return Column;

		type ColumnValueType = TreeNode & IColumn & WithType<ScopedSchemaName<Scope, "Column">>;
		type ColumnInsertableType = InsertableObjectFromSchemaRecord<typeof columnFields>;

		// Returning SingletonSchema without a type conversion results in TypeScript generating something like `readonly "__#124291@#brand": unknown;`
		// for the private brand field of TreeNode.
		// This numeric id doesn't seem to be stable over incremental builds, and thus causes diffs in the API extractor reports.
		// This is avoided by doing this type conversion.
		// The conversion is done via assignment instead of `as` to get stronger type safety.
		const ColumnSchemaType: TreeNodeSchemaClass<
			/* Name */ ScopedSchemaName<Scope, "Column">,
			/* Kind */ NodeKind.Object,
			/* TNode */ ColumnValueType,
			/* TInsertable */ object & ColumnInsertableType,
			/* ImplicitlyConstructable */ true,
			/* Info */ typeof columnFields
		> = Column;

		return ColumnSchemaType;
	}

	/**
	 * Base column schema type.
	 * @sealed @internal @system
	 */
	export type ColumnSchemaBase<TScope extends string | undefined> = ReturnType<
		typeof createColumnSchema<TScope>
	>;

	/**
	 * A row in a table.
	 * @sealed @internal
	 */
	export interface IRow<TCellInsertable, TCellValue, TColumnValue> {
		readonly id: string;
		readonly index: number;
		// TODO: variant that takes ID
		readonly getCell: (column: TColumnValue) => TCellValue | undefined;

		// TODO: variant that takes ID
		setCell(column: TColumnValue, value: TCellInsertable | undefined): void;

		// TODO
	}

	/**
	 * Factory for creating new table row schema.
	 * @sealed @internal
	 */
	// eslint-disable-next-line @typescript-eslint/explicit-function-return-type -- Return type is too complex to be reasonable to specify
	export function createRowSchema<
		const TInputScope extends string | undefined,
		const TCell extends ImplicitAllowedTypes,
		const TColumn extends ColumnSchemaBase<TInputScope> = ColumnSchemaBase<TInputScope>,
	>(
		inputSchemaFactory: SchemaFactoryAlpha<TInputScope>,
		cellSchema: TCell,
		columnSchema: TColumn,
	) {
		const schemaFactory = inputSchemaFactory.scopedFactory(tableSchemaFactorySubScope);
		type Scope = ScopedSchemaName<TInputScope, typeof tableSchemaFactorySubScope>;

		type CellValueType = TreeNodeFromImplicitAllowedTypes<TCell>;
		type CellInsertableType = InsertableTreeNodeFromImplicitAllowedTypes<TCell>;

		type ColumnValueType = TreeNodeFromImplicitAllowedTypes<TColumn>;
		// type ColumnInsertableType = InsertableTreeNodeFromImplicitAllowedTypes<TColumn>;

		type TTable = TreeNodeFromImplicitAllowedTypes<
			TableSchemaBase<TInputScope, TCell, TColumn>
		>;

		/**
		 * Get the parent table of the provided row.
		 * @throws Throws an error if the row is not in a table.
		 */
		function getTableParentOfRow(row: Row): TTable {
			const parent = Tree.parent(row);
			if (parent !== undefined) {
				const grandparent = Tree.parent(parent);
				if (
					grandparent !== undefined &&
					// eslint-disable-next-line @typescript-eslint/no-explicit-any
					(Tree.schema(grandparent) as any)[tableSchemaSymbol] === true
				) {
					return grandparent as TTable;
				}
			}
			throw new Error("Row is not in a table");
		}

		/**
		 * TODO
		 */
		function getRowList(row: Row): TreeArrayNode<typeof Row> {
			return getTableParentOfRow(row).rows as unknown as TreeArrayNode<typeof Row>;
		}

		/**
		 * {@link Row} fields.
		 * @remarks Extracted for re-use in returned type signature defined later in this function.
		 * The implicit typing is intentional.
		 */
		const rowFields = {
			id: schemaFactory.identifier,
			cells: schemaFactory.map("Row.cells", cellSchema),
		} as const satisfies Record<string, ImplicitFieldSchema>;

		/**
		 * The Row schema - this is a map of Cells where the key is the column id
		 */
		class Row extends schemaFactory.object("Row", rowFields) {
			/**
			 * Get a cell by the column
			 * @param column - The column
			 * @returns The cell if it exists, otherwise undefined
			 */
			public getCell(column: ColumnValueType): CellValueType | undefined {
				return this.cells.get(column.id) as CellValueType | undefined;
			}

			/**
			 * Set the value of a cell in the row
			 * @param column - The column
			 * @param value - The value to set
			 */
			public setCell(column: ColumnValueType, value: CellInsertableType | undefined): void {
				this.cells.set(column.id, value);
			}

			/**
			 * Delete a cell from the row
			 * @param column - The column
			 */
			public deleteCell(column: ColumnValueType): void {
				if (!this.cells.has(column.id)) return;
				this.cells.delete(column.id);
			}

			/**
			 * Move a row to a new location
			 * @param index - The index to move the row to
			 */
			public moveTo(index: number): void {
				const rows = getRowList(this);

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
				const rows = getRowList(this);
				return rows.indexOf(this);
			}

			// #region HACKS

			// eslint-disable-next-line import/no-deprecated, @typescript-eslint/explicit-function-return-type
			public override get [typeNameSymbol]() {
				return super[typeNameSymbol];
			}
			// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
			public get [typeSchemaSymbol]() {
				return super[typeSchemaSymbol];
			}

			// #endregion
		}

		// return Row;
		type RowValueType = TreeNode &
			IRow<CellInsertableType, CellValueType, ColumnValueType> &
			WithType<ScopedSchemaName<Scope, "Row">>;
		type RowInsertableType = InsertableObjectFromSchemaRecord<typeof rowFields>;

		// Returning SingletonSchema without a type conversion results in TypeScript generating something like `readonly "__#124291@#brand": unknown;`
		// for the private brand field of TreeNode.
		// This numeric id doesn't seem to be stable over incremental builds, and thus causes diffs in the API extractor reports.
		// This is avoided by doing this type conversion.
		// The conversion is done via assignment instead of `as` to get stronger type safety.
		const RowSchemaType: TreeNodeSchemaClass<
			/* Name */ ScopedSchemaName<Scope, "Row">,
			/* Kind */ NodeKind.Object,
			/* TNode */ RowValueType,
			/* TInsertable */ object & RowInsertableType,
			/* ImplicitlyConstructable */ true,
			/* Info */ typeof rowFields
		> = Row;

		return RowSchemaType;
	}

	/**
	 * Base row schema type.
	 * @sealed @internal @system
	 */
	export type RowSchemaBase<
		TScope extends string | undefined,
		TCell extends ImplicitAllowedTypes,
		TColumn extends ColumnSchemaBase<TScope> = ColumnSchemaBase<TScope>,
	> = ReturnType<typeof createRowSchema<TScope, TCell, TColumn>>;

	/**
	 * A table.
	 * @sealed @internal
	 */
	export interface ITable<
		TCellSchema extends ImplicitAllowedTypes,
		TColumnSchema extends ImplicitAllowedTypes,
		TRowSchema extends ImplicitAllowedTypes,
	> {
		readonly rows: TreeArrayNode<TRowSchema>;
		readonly columns: TreeArrayNode<TColumnSchema>;

		readonly getRow: (id: string) => TreeNodeFromImplicitAllowedTypes<TRowSchema> | undefined;
		readonly getColumn: (
			id: string,
		) => TreeNodeFromImplicitAllowedTypes<TColumnSchema> | undefined;
		readonly getCell: (
			key: CellKey,
		) => TreeNodeFromImplicitAllowedTypes<TCellSchema> | undefined;

		readonly insertColumn: (
			params: InsertColumnParameters<
				InsertableTreeNodeFromImplicitAllowedTypes<TColumnSchema>
			>,
		) => TreeNodeFromImplicitAllowedTypes<TColumnSchema>;
		readonly insertRows: (
			params: InsertRowsParameters<InsertableTreeNodeFromImplicitAllowedTypes<TRowSchema>>,
		) => TreeNodeFromImplicitAllowedTypes<TRowSchema>[];
	}

	/**
	 * Factory for creating new table schema.
	 * @internal
	 */
	// eslint-disable-next-line @typescript-eslint/explicit-function-return-type -- Return type is too complex to be reasonable to specify
	export function createTableSchema<
		const TInputScope extends string | undefined,
		const TCell extends ImplicitAllowedTypes,
		const TColumn extends ColumnSchemaBase<TInputScope> = ColumnSchemaBase<TInputScope>,
		const TRow extends RowSchemaBase<TInputScope, TCell, TColumn> = RowSchemaBase<
			TInputScope,
			TCell,
			TColumn
		>,
	>(
		inputSchemaFactory: SchemaFactoryAlpha<TInputScope>,
		cellSchema: TCell,
		columnSchema: TColumn,
		rowSchema: TRow,
	) {
		const schemaFactory = inputSchemaFactory.scopedFactory(tableSchemaFactorySubScope);
		type Scope = ScopedSchemaName<TInputScope, typeof tableSchemaFactorySubScope>;

		type CellValueType = TreeNodeFromImplicitAllowedTypes<TCell>;
		// type CellInsertableType = InsertableTreeNodeFromImplicitAllowedTypes<TCell>;

		type ColumnValueType = TreeNodeFromImplicitAllowedTypes<TColumn>;
		type ColumnInsertableType = InsertableTreeNodeFromImplicitAllowedTypes<TColumn>;

		type RowValueType = TreeNodeFromImplicitAllowedTypes<TRow>;
		type RowInsertableType = InsertableTreeNodeFromImplicitAllowedTypes<TRow>;

		/**
		 * {@link Table} fields.
		 * @remarks Extracted for re-use in returned type signature defined later in this function.
		 * The implicit typing is intentional.
		 */
		const tableFields = {
			rows: schemaFactory.array("Table.rows", rowSchema),
			columns: schemaFactory.array("Table.columns", columnSchema),
		} as const satisfies Record<string, ImplicitFieldSchema>;

		/**
		 * The Table schema
		 */
		class Table extends schemaFactory.object("Table", tableFields) {
			/**
			 * Get a row by the id
			 * @param id - The id of the row
			 */
			public getRow(id: string): RowValueType | undefined {
				// TypeScript is unable to narrow the types correctly here, hence the casts.
				// See: https://github.com/microsoft/TypeScript/issues/52144
				return this.rows.find((_row) => (_row as RowValueType).id === id) as
					| RowValueType
					| undefined;
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
					// TypeScript is unable to narrow the types correctly here, hence the cast.
					// See: https://github.com/microsoft/TypeScript/issues/52144
					// eslint-disable-next-line @typescript-eslint/no-explicit-any
					this.rows.insertAtEnd(TreeArrayNode.spread(rows) as any);
				} else {
					// TypeScript is unable to narrow the types correctly here, hence the cast.
					// See: https://github.com/microsoft/TypeScript/issues/52144
					// eslint-disable-next-line @typescript-eslint/no-explicit-any
					this.rows.insertAt(index, TreeArrayNode.spread(rows) as any);
				}

				// TODO: verify this
				// Inserting the input nodes into the tree hydrates them, making them usable as nodes.
				return rows as unknown as RowValueType[];
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
					// TypeScript is unable to narrow the types correctly here, hence the cast.
					// See: https://github.com/microsoft/TypeScript/issues/52144
					// eslint-disable-next-line @typescript-eslint/no-explicit-any
					this.columns.insertAtEnd(column as any);
				} else {
					// TypeScript is unable to narrow the types correctly here, hence the cast.
					// See: https://github.com/microsoft/TypeScript/issues/52144
					// eslint-disable-next-line @typescript-eslint/no-explicit-any
					this.columns.insertAt(index, column as any);
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
				// TypeScript is unable to narrow the types correctly here, hence the casts.
				// See: https://github.com/microsoft/TypeScript/issues/52144
				return this.columns.find((column) => (column as ColumnValueType).id === id) as
					| ColumnValueType
					| undefined;
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

			// TODO: verify this works
			public static readonly [tableSchemaSymbol] = true;

			// #region HACKS

			// eslint-disable-next-line import/no-deprecated, @typescript-eslint/explicit-function-return-type
			public override get [typeNameSymbol]() {
				return super[typeNameSymbol];
			}
			// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
			public get [typeSchemaSymbol]() {
				return super[typeSchemaSymbol];
			}

			// #endregion
		}

		// return Table;

		type TableValueType = TreeNode &
			ITable<TCell, TColumn, TRow> &
			WithType<ScopedSchemaName<Scope, "Table">>;
		type TableInsertableType = InsertableObjectFromSchemaRecord<typeof tableFields>;

		// Returning SingletonSchema without a type conversion results in TypeScript generating something like `readonly "__#124291@#brand": unknown;`
		// for the private brand field of TreeNode.
		// This numeric id doesn't seem to be stable over incremental builds, and thus causes diffs in the API extractor reports.
		// This is avoided by doing this type conversion.
		// The conversion is done via assignment instead of `as` to get stronger type safety.
		const TableSchemaType: TreeNodeSchemaClass<
			/* Name */ ScopedSchemaName<Scope, "Table">,
			/* Kind */ NodeKind.Object,
			/* TNode */ TableValueType,
			/* TInsertable */ object & TableInsertableType,
			/* ImplicitlyConstructable */ true,
			/* Info */ typeof tableFields
		> = Table;

		// Return the table schema
		return TableSchemaType;
	}

	/**
	 * Base row schema type.
	 * @sealed @internal @system
	 */
	export type TableSchemaBase<
		TScope extends string | undefined,
		TCell extends ImplicitAllowedTypes,
		TColumn extends ColumnSchemaBase<TScope> = ColumnSchemaBase<TScope>,
		TRow extends RowSchemaBase<TScope, TCell, TColumn> = RowSchemaBase<TScope, TCell, TColumn>,
	> = ReturnType<typeof createTableSchema<TScope, TCell, TColumn, TRow>>;
}
