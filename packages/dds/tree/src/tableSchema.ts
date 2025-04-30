/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { oob } from "@fluidframework/core-utils/internal";

import { Tree } from "./shared-tree/index.js";
import {
	/* eslint-disable @typescript-eslint/no-unused-vars, unused-imports/no-unused-imports */
	type FieldHasDefault,
	type FieldKind,
	type FieldSchema,
	type LeafSchema,
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
	type TreeNodeSchema,
	type TreeNodeSchemaClass,
	type WithType,
	type TreeFieldFromImplicitField,
	type InsertableTreeFieldFromImplicitField,
	type InternalTreeNode,
	/* eslint-enable @typescript-eslint/no-unused-vars, unused-imports/no-unused-imports */
} from "./simple-tree/index.js";

// Future improvement TODOs (ideally to be done before promoting these APIs to `@alpha`):
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
	export interface IColumn<TPropsSchema extends ImplicitFieldSchema = ImplicitFieldSchema> {
		/**
		 * The unique identifier of the column.
		 * @remarks Uniquely identifies the node within the entire tree, not just the table.
		 */
		readonly id: string;

		/**
		 * The column's properties.
		 * @remarks This is a user-defined schema that can be used to store additional information about the column.
		 */
		get props(): TreeFieldFromImplicitField<TPropsSchema> | undefined;
		set props(value: InsertableTreeFieldFromImplicitField<TPropsSchema>);
	}

	/**
	 * Factory for creating new table column schema.
	 * @privateRemarks
	 * TODO:
	 * - Add overloads to make propsSchema optional.
	 * - Take field schema rather than node schema for `propsSchema`, in particular to allow making
	 * the additional properties optional.
	 * @internal
	 */
	// eslint-disable-next-line @typescript-eslint/explicit-function-return-type -- Return type is too complex to be reasonable to specify
	export function createColumn<
		const TInputScope extends string | undefined,
		const TPropsSchema extends ImplicitFieldSchema,
	>(inputSchemaFactory: SchemaFactoryAlpha<TInputScope>, propsSchema: TPropsSchema) {
		const schemaFactory = inputSchemaFactory.scopedFactory(tableSchemaFactorySubScope);
		type Scope = ScopedSchemaName<TInputScope, typeof tableSchemaFactorySubScope>;

		// Note: `columnFields` is broken into two parts to work around a TypeScript bug
		// that results in broken `.d.ts` output.
		// See definition of `ColumnInsertableType` below.
		const columnFieldsBuiltInParts = {
			id: schemaFactory.identifier,
		} as const;
		const columnFieldsPropsPart = {
			props: propsSchema,
		} as const;

		/**
		 * {@link Column} fields.
		 *
		 * @remarks
		 * Extracted for re-use in returned type signature defined later in this function.
		 * The implicit typing is intentional.
		 *
		 * Note: ideally we would add a satisfies clause here to ensure that this satisfies
		 * `Record<string, ImplicitFieldSchema>`, but doing so causes TypeScript to prematurely and incorrectly evaluate the type of `propsSchema`.
		 * Likely related to the following issue: https://github.com/microsoft/TypeScript/issues/52394
		 */
		const columnFields = {
			...columnFieldsBuiltInParts,
			...columnFieldsPropsPart,
		} as const; // satisfies Record<string, ImplicitFieldSchema>;

		/**
		 * A column in a table.
		 */
		class Column extends schemaFactory.object("Column", columnFields) {}

		type ColumnValueType = TreeNode &
			IColumn<TPropsSchema> &
			WithType<ScopedSchemaName<Scope, "Column">>;

		// Note: ideally this type would just leverage `InsertableObjectFromSchemaRecord<typeof columnFields>`,
		// but that results in broken `.d.ts` output due to a TypeScript bug.
		// Instead we extract and inline the typing of the "props" field here, which seems to sufficiently work around the issue.
		// type ColumnInsertableType = InsertableObjectFromSchemaRecord<typeof columnFields>;
		type ColumnInsertableType = InsertableObjectFromSchemaRecord<
			typeof columnFieldsBuiltInParts
		> &
			(FieldHasDefault<TPropsSchema> extends true
				? {
						/**
						 * The column's properties.
						 * @remarks This is a user-defined schema that can be used to store additional information about the column.
						 */
						props?: InsertableTreeFieldFromImplicitField<TPropsSchema>;
					}
				: {
						/**
						 * The column's properties.
						 * @remarks This is a user-defined schema that can be used to store additional information about the column.
						 */
						props: InsertableTreeFieldFromImplicitField<TPropsSchema>;
					});

		// Modified version of `Column` that ensures the constructor (and `createFromInsertable`) are
		// typed correctly in terms of our insertable type.
		type ColumnSchemaModifiedType = Omit<
			{
				[Property in keyof typeof Column]: (typeof Column)[Property];
			},
			"createFromInsertable"
		> &
			(new (
				props: InternalTreeNode | ColumnInsertableType,
			) => Column) & {
				createFromInsertable(props: ColumnInsertableType): Column;
			};

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
		> = Column as ColumnSchemaModifiedType;

		return ColumnSchemaType;
	}

	/**
	 * Base column schema type.
	 * @sealed @system @internal
	 */
	export type ColumnSchemaBase<
		TScope extends string | undefined,
		TPropsSchema extends ImplicitFieldSchema,
	> = ReturnType<typeof createColumn<TScope, TPropsSchema>>;

	// #endregion

	// #region Row

	/**
	 * A row in a table.
	 * @remarks Implemented by the schema class returned from {@link TableSchema.createRow}.
	 * @sealed @internal
	 */
	export interface IRow<
		TCellSchema extends ImplicitAllowedTypes,
		TPropsSchema extends ImplicitFieldSchema = ImplicitFieldSchema,
	> {
		/**
		 * The unique identifier of the row.
		 * @remarks Uniquely identifies the node within the entire tree, not just the table.
		 */
		readonly id: string;

		/**
		 * Gets the cell in the specified column.
		 * @returns The cell if it exists, otherwise undefined.
		 */
		getCell(column: IColumn): TreeNodeFromImplicitAllowedTypes<TCellSchema> | undefined;
		/**
		 * Gets the cell in the specified column, denoted by column ID.
		 * @returns The cell if it exists, otherwise undefined.
		 */
		getCell(columnId: string): TreeNodeFromImplicitAllowedTypes<TCellSchema> | undefined;

		/**
		 * Sets the cell in the specified column.
		 * @remarks To remove a cell, call {@link TableSchema.IRow.(removeCell:1)} instead.
		 */
		setCell(
			column: IColumn,
			value: InsertableTreeNodeFromImplicitAllowedTypes<TCellSchema>,
		): void;
		/**
		 * Sets the cell in the specified column, denoted by column ID.
		 * @remarks To remove a cell, call {@link TableSchema.IRow.(removeCell:2)} instead.
		 */
		setCell(
			columnId: string,
			value: InsertableTreeNodeFromImplicitAllowedTypes<TCellSchema>,
		): void;

		/**
		 * Removes the cell in the specified column.
		 * @privateRemarks TODO: return removed cell
		 */
		removeCell(column: IColumn): void;
		/**
		 * Removes the cell in the specified column, denoted by column ID.
		 * @privateRemarks TODO: return removed cell
		 */
		removeCell(columnId: string): void;

		/**
		 * The row's properties.
		 * @remarks This is a user-defined schema that can be used to store additional information about the row.
		 */
		get props(): TreeFieldFromImplicitField<TPropsSchema>;
		set props(value: InsertableTreeFieldFromImplicitField<TPropsSchema>);
	}

	/**
	 * Factory for creating new table row schema.
	 *
	 * @privateRemarks
	 * TODO:
	 * - Add overloads to make propsSchema optional.
	 * - Take field schema rather than node schema for `propsSchema`, in particular to allow making
	 * the additional properties optional.
	 *
	 * @sealed @internal
	 */
	// eslint-disable-next-line @typescript-eslint/explicit-function-return-type -- Return type is too complex to be reasonable to specify
	export function createRow<
		const TInputScope extends string | undefined,
		const TCellSchema extends ImplicitAllowedTypes,
		const TPropsSchema extends ImplicitFieldSchema,
	>(
		inputSchemaFactory: SchemaFactoryAlpha<TInputScope>,
		cellSchema: TCellSchema,
		propsSchema: TPropsSchema,
	) {
		const schemaFactory = inputSchemaFactory.scopedFactory(tableSchemaFactorySubScope);
		type Scope = ScopedSchemaName<TInputScope, typeof tableSchemaFactorySubScope>;

		type CellValueType = TreeNodeFromImplicitAllowedTypes<TCellSchema>;
		type CellInsertableType = InsertableTreeNodeFromImplicitAllowedTypes<TCellSchema>;

		// Note: `rowFields` is broken into two parts to work around a TypeScript bug
		// that results in broken `.d.ts` output.
		// See definition of `RowInsertableType` below.
		const rowFieldsBuiltInParts = {
			id: schemaFactory.identifier,
			cells: schemaFactory.required(schemaFactory.map("Row.cells", cellSchema), {
				metadata: {
					description: "The cells of the table row, keyed by column ID.",
				},
			}),
		} as const;
		const rowFieldsPropsPart = {
			props: propsSchema,
		} as const;

		/**
		 * {@link Row} fields.
		 * @remarks Extracted for re-use in returned type signature defined later in this function.
		 * The implicit typing is intentional.
		 * Note: ideally we would add a satisfies clause here to ensure that this satisfies
		 * `Record<string, ImplicitFieldSchema>`, but doing so causes TypeScript to prematurely and incorrectly evaluate the type of `propsSchema`.
		 * Likely related to the following issue: https://github.com/microsoft/TypeScript/issues/52394
		 */
		const rowFields = {
			...rowFieldsBuiltInParts,
			...rowFieldsPropsPart,
		} as const; // satisfies Record<string, ImplicitFieldSchema>;

		/**
		 * The Row schema - this is a map of Cells where the key is the column id
		 */
		class Row
			extends schemaFactory.object("Row", rowFields)
			implements IRow<TCellSchema, TPropsSchema>
		{
			public getCell(columnOrId: IColumn | string): CellValueType | undefined {
				const columnId = typeof columnOrId === "string" ? columnOrId : columnOrId.id;
				return this.cells.get(columnId) as CellValueType | undefined;
			}

			public setCell(
				columnOrId: IColumn | string,
				value: CellInsertableType | undefined,
			): void {
				const columnId = typeof columnOrId === "string" ? columnOrId : columnOrId.id;
				this.cells.set(columnId, value);
			}

			public removeCell(columnOrId: IColumn | string): void {
				const columnId = typeof columnOrId === "string" ? columnOrId : columnOrId.id;
				if (!this.cells.has(columnId)) {
					return;
				}
				this.cells.delete(columnId);
			}
		}

		type RowValueType = TreeNode &
			IRow<TCellSchema, TPropsSchema> &
			WithType<ScopedSchemaName<Scope, "Row">>;

		// Note: ideally this type would just leverage `InsertableObjectFromSchemaRecord<typeof rowFields>`,
		// but that results in broken `.d.ts` output due to a TypeScript bug.
		// Instead we extract and inline the typing of the "props" field here, which seems to sufficiently work around the issue.
		// type RowInsertableType = InsertableObjectFromSchemaRecord<typeof rowFields>;
		type RowInsertableType = InsertableObjectFromSchemaRecord<typeof rowFieldsBuiltInParts> &
			(FieldHasDefault<TPropsSchema> extends true
				? {
						/**
						 * The row's properties.
						 * @remarks This is a user-defined schema that can be used to store additional information about the row.
						 */
						props?: InsertableTreeFieldFromImplicitField<TPropsSchema>;
					}
				: {
						/**
						 * The row's properties.
						 * @remarks This is a user-defined schema that can be used to store additional information about the row.
						 */
						props: InsertableTreeFieldFromImplicitField<TPropsSchema>;
					});

		// Modified version of `Column` that ensures the constructor (and `createFromInsertable`) are
		// typed correctly in terms of our insertable type.
		type RowSchemaModifiedType = Omit<
			{
				[Property in keyof typeof Row]: (typeof Row)[Property];
			},
			"createFromInsertable"
		> &
			(new (
				props: InternalTreeNode | RowInsertableType,
			) => Row) & {
				createFromInsertable(props: RowInsertableType): Row;
			};

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
		> = Row as RowSchemaModifiedType;

		return RowSchemaType;
	}

	/**
	 * Base row schema type.
	 * @sealed @system @internal
	 */
	export type RowSchemaBase<
		TScope extends string | undefined,
		TCellSchema extends ImplicitAllowedTypes,
		TPropsSchema extends ImplicitFieldSchema,
	> = ReturnType<typeof createRow<TScope, TCellSchema, TPropsSchema>>;

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
		 * @remarks To remove a cell, call {@link TableSchema.ITable.removeCell} instead.
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
		 * Removes 0 or more rows from the table.
		 * @privateRemarks TODO: policy for when 1 or more rows are not in the table.
		 */
		removeRows: (rows: readonly TreeNodeFromImplicitAllowedTypes<TRowSchema>[]) => void;

		/**
		 * Removes all rows from the table.
		 */
		removeAllRows: () => void;

		/**
		 * Removes the cell at the specified location in the table.
		 * @privateRemarks TODO: add overload that takes column/row nodes?
		 */
		removeCell: (key: CellKey) => void;
	}

	/**
	 * Factory for creating new table schema without specifying row or column schema.
	 * @internal
	 */
	export function createTable<
		const TInputScope extends string | undefined,
		const TCell extends ImplicitAllowedTypes,
	>(
		inputSchemaFactory: SchemaFactoryAlpha<TInputScope>,
		_cellSchema: TCell,
	): ReturnType<typeof createTableInternal<TInputScope, TCell>>;
	/**
	 * Factory for creating new table schema without specifying row schema
	 * @internal
	 */
	export function createTable<
		const TInputScope extends string | undefined,
		const TCell extends ImplicitAllowedTypes,
		const TColumn extends ColumnSchemaBase<TInputScope, ImplicitFieldSchema>,
	>(
		inputSchemaFactory: SchemaFactoryAlpha<TInputScope>,
		_cellSchema: TCell,
		columnSchema: TColumn,
	): ReturnType<typeof createTableInternal<TInputScope, TCell, TColumn>>;
	/**
	 * Factory for creating new table schema.
	 * @internal
	 */
	export function createTable<
		const TInputScope extends string | undefined,
		const TCell extends ImplicitAllowedTypes,
		const TColumn extends ColumnSchemaBase<TInputScope, ImplicitFieldSchema>,
		const TRow extends RowSchemaBase<TInputScope, TCell, ImplicitFieldSchema>,
	>(
		inputSchemaFactory: SchemaFactoryAlpha<TInputScope>,
		_cellSchema: TCell,
		columnSchema: TColumn,
		rowSchema: TRow,
	): ReturnType<typeof createTableInternal<TInputScope, TCell, TColumn, TRow>>;
	/** `createTable` implementation */
	export function createTable<
		const TInputScope extends string | undefined,
		const TCell extends ImplicitAllowedTypes,
		const TColumn extends ColumnSchemaBase<TInputScope, ImplicitFieldSchema>,
		const TRow extends RowSchemaBase<TInputScope, TCell, ImplicitFieldSchema>,
	>(
		inputSchemaFactory: SchemaFactoryAlpha<TInputScope>,
		_cellSchema: TCell,
		columnSchema?: TColumn,
		rowSchema?: TRow,
	): TreeNodeSchema {
		const column =
			columnSchema ??
			createColumn(inputSchemaFactory, inputSchemaFactory.optional(inputSchemaFactory.null));
		return createTableInternal(
			inputSchemaFactory,
			_cellSchema,
			column as TColumn,
			rowSchema ??
				(createRow(
					inputSchemaFactory,
					_cellSchema,
					inputSchemaFactory.optional(inputSchemaFactory.null),
				) as TRow),
		);
	}

	/**
	 * Factory for creating new table schema.
	 * @system @internal
	 */
	// eslint-disable-next-line @typescript-eslint/explicit-function-return-type -- Return type is too complex to be reasonable to specify
	export function createTableInternal<
		const TInputScope extends string | undefined,
		const TCell extends ImplicitAllowedTypes,
		const TColumn extends ColumnSchemaBase<
			TInputScope,
			ImplicitFieldSchema
		> = ColumnSchemaBase<TInputScope, ImplicitFieldSchema>,
		const TRow extends RowSchemaBase<TInputScope, TCell, ImplicitFieldSchema> = RowSchemaBase<
			TInputScope,
			TCell,
			ImplicitFieldSchema
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
						return row.getCell(column.id);
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
						row.setCell(column.id, cell);
					}
				}
			}

			public removeColumn(column: ColumnValueType): void {
				const index = this.columns.indexOf(column);
				// If the column is not in the table, do nothing
				if (index === -1) return;
				this.columns.removeAt(index);
			}

			public removeRows(rows: readonly RowValueType[]): void {
				// If there are no rows to remove, do nothing
				if (rows.length === 0) {
					return;
				}

				// If there is only one row to remove, remove it
				if (rows.length === 1) {
					const index = this.rows.indexOf(rows[0] ?? oob());
					this.rows.removeAt(index);
					return;
				}
				// If there are multiple rows to remove, remove them in a transaction
				// This is to avoid the performance issues of deleting multiple rows at once
				Tree.runTransaction(this, () => {
					// Iterate over the rows and remove them
					for (const row of rows) {
						const index = this.rows.indexOf(row);
						this.rows.removeAt(index);
					}
				});
			}

			public removeAllRows(): void {
				this.rows.removeRange();
			}

			public removeCell(key: CellKey): void {
				const { columnId, rowId } = key;
				const row = this.getRow(rowId);
				if (row !== undefined) {
					const column = this.getColumn(columnId);
					if (column !== undefined) {
						row.removeCell(column.id);
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
		TColumn extends ColumnSchemaBase<TScope, ImplicitFieldSchema> = ColumnSchemaBase<
			TScope,
			ImplicitFieldSchema
		>,
		TRow extends RowSchemaBase<TScope, TCell, ImplicitAllowedTypes> = RowSchemaBase<
			TScope,
			TCell,
			ImplicitAllowedTypes
		>,
	> = ReturnType<typeof createTable<TScope, TCell, TColumn, TRow>>;

	// #endregion
}
