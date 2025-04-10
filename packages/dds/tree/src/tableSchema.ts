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
	type WithType,
} from "./simple-tree/index.js";

// Future improvement TODOs (ideally to be done before promoting these APIs to `@alpha`):
// - Custom fields on Table/Row/Column (props pattern from Nick's demo)
// - Overloads to make Column/Row schema optional when constructing Tables
// - Record-like type parameters / input parameters?
// - Move `@system` types into separate / sub scope?

/**
 * Contains types and factories for creating schema to represent dynamic tabular data.
 * @privateRemarks TODO: document in more detail and add `@example`s.
 * @internal
 */
export namespace TableSchema {
	const tableSchemaFactorySubScope = "table";

	// #region Column

	/**
	 * A column in a table.
	 * @remarks Implemented by the schema class returned from {@link TableSchema.createColumn}.
	 * @sealed @internal
	 */
	export interface IColumn {
		/**
		 * The unique identifier of the column.
		 * @remarks Uniquely identifies the node within the entire tree, not just the table.
		 */
		readonly id: string;
	}

	/**
	 * Factory for creating new table column schema.
	 * @internal
	 */
	// eslint-disable-next-line @typescript-eslint/explicit-function-return-type -- Return type is too complex to be reasonable to specify
	export function createColumn<const TInputScope extends string | undefined>(
		inputSchemaFactory: SchemaFactoryAlpha<TInputScope>,
	) {
		const schemaFactory = inputSchemaFactory.scopedFactory(tableSchemaFactorySubScope);
		type Scope = ScopedSchemaName<TInputScope, typeof tableSchemaFactorySubScope>;

		/**
		 * {@link Column} fields.
		 * @remarks Extracted for re-use in returned type signature defined later in this function.
		 * The implicit typing is intentional.
		 */
		const columnFields = {
			id: schemaFactory.identifier,
		} as const satisfies Record<string, ImplicitFieldSchema>;

		/**
		 * A column in a table.
		 */
		class Column extends schemaFactory.object("Column", columnFields) implements IColumn {}

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
	 * @sealed @system @internal
	 */
	export type ColumnSchemaBase<TScope extends string | undefined> = ReturnType<
		typeof createColumn<TScope>
	>;

	// #endregion

	// #region Row

	/**
	 * A row in a table.
	 * @remarks Implemented by the schema class returned from {@link TableSchema.createRow}.
	 * @sealed @internal
	 */
	export interface IRow<
		TCellSchema extends ImplicitAllowedTypes,
		TColumnSchema extends ImplicitAllowedTypes,
	> {
		/**
		 * The unique identifier of the row.
		 * @remarks Uniquely identifies the node within the entire tree, not just the table.
		 */
		readonly id: string;

		/**
		 * Gets the cell in the specified column
		 * @returns The cell if it exists, otherwise undefined.
		 * @privateRemarks TODO: add overload that takes column ID.
		 */
		getCell(
			column: TreeNodeFromImplicitAllowedTypes<TColumnSchema>,
		): TreeNodeFromImplicitAllowedTypes<TCellSchema> | undefined;

		/**
		 * Sets the cell in the specified column.
		 * @remarks To delete a cell, call {@link TableSchema.IRow.deleteCell} instead.
		 * @privateRemarks TODO: add overload that takes column ID.
		 */
		setCell(
			column: TreeNodeFromImplicitAllowedTypes<TColumnSchema>,
			value: InsertableTreeNodeFromImplicitAllowedTypes<TCellSchema>,
		): void;

		/**
		 * Deletes the cell in the specified column.
		 * @privateRemarks TODO: add overload that takes column ID.
		 */
		deleteCell(column: TreeNodeFromImplicitAllowedTypes<TColumnSchema>): void;
	}

	/**
	 * Factory for creating new table row schema.
	 * @privateRemarks TODO: add overloads to make column schema optional.
	 * @sealed @internal
	 */
	// eslint-disable-next-line @typescript-eslint/explicit-function-return-type -- Return type is too complex to be reasonable to specify
	export function createRow<
		const TInputScope extends string | undefined,
		const TCellSchema extends ImplicitAllowedTypes,
		const TColumnSchema extends ColumnSchemaBase<TInputScope> = ColumnSchemaBase<TInputScope>,
	>(
		inputSchemaFactory: SchemaFactoryAlpha<TInputScope>,
		cellSchema: TCellSchema,
		_columnSchema: TColumnSchema,
	) {
		const schemaFactory = inputSchemaFactory.scopedFactory(tableSchemaFactorySubScope);
		type Scope = ScopedSchemaName<TInputScope, typeof tableSchemaFactorySubScope>;

		type CellValueType = TreeNodeFromImplicitAllowedTypes<TCellSchema>;
		type CellInsertableType = InsertableTreeNodeFromImplicitAllowedTypes<TCellSchema>;

		type ColumnValueType = TreeNodeFromImplicitAllowedTypes<TColumnSchema>;

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
		class Row
			extends schemaFactory.object("Row", rowFields)
			implements IRow<TCellSchema, TColumnSchema>
		{
			public getCell(column: ColumnValueType): CellValueType | undefined {
				return this.cells.get(column.id) as CellValueType | undefined;
			}

			public setCell(column: ColumnValueType, value: CellInsertableType | undefined): void {
				this.cells.set(column.id, value);
			}

			public deleteCell(column: ColumnValueType): void {
				if (!this.cells.has(column.id)) return;
				this.cells.delete(column.id);
			}
		}

		type RowValueType = TreeNode &
			IRow<TCellSchema, TColumnSchema> &
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
	 * @sealed @system @internal
	 */
	export type RowSchemaBase<
		TScope extends string | undefined,
		TCellSchema extends ImplicitAllowedTypes,
		TColumnSchema extends ColumnSchemaBase<TScope> = ColumnSchemaBase<TScope>,
	> = ReturnType<typeof createRow<TScope, TCellSchema, TColumnSchema>>;

	// #endregion

	// #region Table

	/**
	 * A key to uniquely identify a cell in a table.
	 * @sealed @internal
	 */
	export interface CellKey {
		/**
		 * {@link TableSchema.IColumn.id} of the containing {@link TableSchema.IColumn}.
		 */
		readonly columnId: string;

		/**
		 * {@link TableSchema.IRow.id} of the containing {@link TableSchema.IRow}.
		 */
		readonly rowId: string;
	}

	/**
	 * {@link TableSchema.ITable.insertColumn} parameters.
	 * @sealed @internal
	 */
	export interface InsertColumnParameters<TInsertableColumn> {
		/**
		 * The index at which to insert the new column.
		 * @remarks If not provided, the column will be appended to the end of the table.
		 */
		readonly index?: number | undefined;

		/**
		 * The column to insert.
		 */
		readonly column: TInsertableColumn;
	}

	/**
	 * {@link TableSchema.ITable.insertRows} parameters.
	 * @sealed @internal
	 */
	export interface InsertRowsParameters<TInsertableRow> {
		/**
		 * The index at which to insert the new rows.
		 * @remarks If not provided, the rows will be appended to the end of the table.
		 */
		readonly index?: number | undefined;

		/**
		 * The rows to insert.
		 */
		readonly rows: TInsertableRow[];
	}

	/**
	 * {@link TableSchema.ITable.setCell} parameters.
	 * @sealed @internal
	 */
	export interface SetCellParameters<TInsertableCell> {
		/**
		 * The key to uniquely identify a cell in a table.
		 */
		readonly key: CellKey;

		/**
		 * The cell to set.
		 */
		readonly cell: TInsertableCell;
	}

	/**
	 * A table.
	 * @sealed @internal
	 */
	export interface ITable<
		TCellSchema extends ImplicitAllowedTypes,
		TColumnSchema extends ImplicitAllowedTypes,
		TRowSchema extends ImplicitAllowedTypes,
	> {
		/**
		 * The table's columns.
		 */
		readonly columns: TreeArrayNode<TColumnSchema>;

		/**
		 * The table's rows.
		 */
		readonly rows: TreeArrayNode<TRowSchema>;

		/**
		 * Gets a table column by its {@link TableSchema.IRow.id}.
		 */
		getColumn(id: string): TreeNodeFromImplicitAllowedTypes<TColumnSchema> | undefined;

		/**
		 * Gets a table row by its {@link TableSchema.IRow.id}.
		 */
		getRow(id: string): TreeNodeFromImplicitAllowedTypes<TRowSchema> | undefined;

		/**
		 * Gets a cell in the table by column and row IDs.
		 * @param key - A key that uniquely distinguishes a cell in the table, represented as a combination of the column ID and row ID.
		 * @privateRemarks TODO: add overload that takes row and column nodes.
		 */
		getCell(key: CellKey): TreeNodeFromImplicitAllowedTypes<TCellSchema> | undefined;

		/**
		 * Inserts a column into the table.
		 * @throws Throws an error if the column is already in the tree, or if the specified index is out of range.
		 */
		insertColumn(
			params: InsertColumnParameters<
				InsertableTreeNodeFromImplicitAllowedTypes<TColumnSchema>
			>,
		): TreeNodeFromImplicitAllowedTypes<TColumnSchema>;

		/**
		 * Inserts 0 or more rows into the table.
		 * @throws Throws an error if any of the rows are already in the tree, or if the specified index is out of range.
		 */
		insertRows(
			params: InsertRowsParameters<InsertableTreeNodeFromImplicitAllowedTypes<TRowSchema>>,
		): TreeNodeFromImplicitAllowedTypes<TRowSchema>[];

		/**
		 * Sets the cell at the specified location in the table.
		 * @remarks To delete a cell, call {@link TableSchema.ITable.deleteCell} instead.
		 * @privateRemarks TODO: add overload that takes column/row nodes?
		 */
		setCell(
			params: SetCellParameters<InsertableTreeNodeFromImplicitAllowedTypes<TCellSchema>>,
		): void;

		/**
		 * Removes the specified column from the table.
		 * @remarks Note: this does not remove any cells from the table's rows.
		 * @privateRemarks
		 * TODO:
		 * - Policy for when the column is not in the table.
		 * - Actually remove corresponding cells from table rows.
		 */
		removeColumn: (column: TreeNodeFromImplicitAllowedTypes<TColumnSchema>) => void;

		/**
		 * Deletes 0 or more rows from the table.
		 * @privateRemarks TODO: policy for when 1 or more rows are not in the table.
		 */
		deleteRows: (rows: readonly TreeNodeFromImplicitAllowedTypes<TRowSchema>[]) => void;

		/**
		 * Deletes all rows from the table.
		 */
		deleteAllRows: () => void;

		/**
		 * Deletes the cell at the specified location in the table.
		 * @privateRemarks TODO: add overload that takes column/row nodes?
		 */
		deleteCell: (key: CellKey) => void;
	}

	/**
	 * Factory for creating new table schema.
	 * @privateRemarks TODO: add overloads to make column/row schema optional.
	 * @internal
	 */
	// eslint-disable-next-line @typescript-eslint/explicit-function-return-type -- Return type is too complex to be reasonable to specify
	export function createTable<
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
		_cellSchema: TCell,
		columnSchema: TColumn,
		rowSchema: TRow,
	) {
		const schemaFactory = inputSchemaFactory.scopedFactory(tableSchemaFactorySubScope);
		type Scope = ScopedSchemaName<TInputScope, typeof tableSchemaFactorySubScope>;

		type CellValueType = TreeNodeFromImplicitAllowedTypes<TCell>;
		type CellInsertableType = InsertableTreeNodeFromImplicitAllowedTypes<TCell>;

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
		class Table
			extends schemaFactory.object("Table", tableFields)
			implements ITable<TCell, TColumn, TRow>
		{
			public getColumn(id: string): ColumnValueType | undefined {
				// TypeScript is unable to narrow the types correctly here, hence the casts.
				// See: https://github.com/microsoft/TypeScript/issues/52144
				return this.columns.find((column) => (column as ColumnValueType).id === id) as
					| ColumnValueType
					| undefined;
			}

			public getRow(id: string): RowValueType | undefined {
				// TypeScript is unable to narrow the types correctly here, hence the casts.
				// See: https://github.com/microsoft/TypeScript/issues/52144
				return this.rows.find((_row) => (_row as RowValueType).id === id) as
					| RowValueType
					| undefined;
			}

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

				// Inserting the input node into the tree hydrates it, making it usable as a node.
				return column as ColumnValueType;
			}

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

				// Inserting the input nodes into the tree hydrates them, making them usable as nodes.
				return rows as unknown as RowValueType[];
			}

			public setCell({ key, cell }: SetCellParameters<CellInsertableType>): void {
				const { columnId, rowId } = key;
				const row = this.getRow(rowId);
				if (row !== undefined) {
					const column = this.getColumn(columnId);
					if (column !== undefined) {
						row.setCell(column, cell);
					}
				}
			}

			public removeColumn(column: ColumnValueType): void {
				const index = this.columns.indexOf(column);
				// If the column is not in the table, do nothing
				if (index === -1) return;
				this.columns.removeAt(index);
			}

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

			public deleteAllRows(): void {
				this.rows.removeRange();
			}

			public deleteCell(key: CellKey): void {
				const { columnId, rowId } = key;
				const row = this.getRow(rowId);
				if (row !== undefined) {
					const column = this.getColumn(columnId);
					if (column !== undefined) {
						row.deleteCell(column);
					}
				}
			}
		}

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
	 * @sealed @system @internal
	 */
	export type TableSchemaBase<
		TScope extends string | undefined,
		TCell extends ImplicitAllowedTypes,
		TColumn extends ColumnSchemaBase<TScope> = ColumnSchemaBase<TScope>,
		TRow extends RowSchemaBase<TScope, TCell, TColumn> = RowSchemaBase<TScope, TCell, TColumn>,
	> = ReturnType<typeof createTable<TScope, TCell, TColumn, TRow>>;

	// #endregion
}
