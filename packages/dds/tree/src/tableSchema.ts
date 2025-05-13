/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { oob } from "@fluidframework/core-utils/internal";
import { UsageError } from "@fluidframework/telemetry-utils/internal";

import { Tree } from "./shared-tree/index.js";
import {
	type FieldHasDefault,
	type ImplicitAllowedTypes,
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
	SchemaFactory,
	type ImplicitAnnotatedFieldSchema,
	type UnannotateImplicitFieldSchema,
} from "./simple-tree/index.js";

// Future improvement TODOs:
// - Omit `cells` property from Row insertion type.
// - Record-like type parameters / input parameters?
// - Omit `props` properties from Row and Column schemas when not provided?

// Longer-term work:
// - Add constraint APIs to make it possible to avoid situations that could yield "orphaned" cells.

/**
 * The sub-scope applied to user-provided {@link SchemaFactory}s by table schema factories.
 */
const tableSchemaFactorySubScope = "table";

/**
 * Not intended for use outside of this package.
 *
 * @privateRemarks
 * This namespace is a collection of internal system types relate to {@link TableSchema}.
 * This namespace should be strictly type-exported by the package.
 * All members should be tagged with `@system`.
 *
 * @system @alpha
 */
export namespace System_TableSchema {
	/**
	 * Default type used for column and row "props" fields.
	 * @privateRemarks
	 * Longer term, it would be better to simply omit "props" altogether by default.
	 * For now, this ensures that the user doesn't have to specify a "props" entry when initializing column/row nodes
	 * and ensures that they cannot set anything that might conflict with future evolutions of the schema.
	 * @system @alpha
	 */
	export type DefaultPropsType = ReturnType<typeof SchemaFactory.optional<[]>>;

	/**
	 * A base interface for factory input options which include an schema factory.
	 * @remarks This interface should not be referenced directly.
	 * @privateRemarks This interface primarily exists to provide a single home for property documentation.
	 * @system @alpha
	 */
	export interface OptionsWithSchemaFactory<TSchemaFactory extends SchemaFactoryAlpha> {
		/**
		 * Schema factory with which the Column schema will be associated.
		 * @remarks Can be used to associate the resulting schema with an existing {@link SchemaFactory.scope|scope}.
		 */
		readonly schemaFactory: TSchemaFactory;
	}

	/**
	 * A base interface for factory input options which include the table cell schema.
	 * @remarks This interface should not be referenced directly.
	 * @privateRemarks This interface primarily exists to provide a single home for property documentation.
	 * @system @alpha
	 */
	export interface OptionsWithCellSchema<TCellSchema extends ImplicitAllowedTypes> {
		/**
		 * Schema for the table's cells.
		 */
		readonly cell: TCellSchema;
	}

	// #region Column

	/**
	 * Base options for creating table cow schema.
	 * @remarks Includes parameters common to all column factory overloads.
	 * @system @alpha
	 */
	export type CreateColumnOptionsBase<
		TSchemaFactory extends SchemaFactoryAlpha = SchemaFactoryAlpha,
	> = OptionsWithSchemaFactory<TSchemaFactory>;

	/**
	 * Factory for creating column schema.
	 * @system @alpha
	 */
	// eslint-disable-next-line @typescript-eslint/explicit-function-return-type -- Return type is too complex to be reasonable to specify
	export function createColumnSchema<
		const TInputScope extends string | undefined,
		const TPropsSchema extends ImplicitAnnotatedFieldSchema,
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
		class Column
			extends schemaFactory.objectAlpha("Column", columnFields, {
				// Will make it easier to evolve this schema in the future.
				allowUnknownOptionalFields: true,
			})
			implements TableSchema.Column<TPropsSchema> {}

		type ColumnValueType = TreeNode &
			TableSchema.Column<TPropsSchema> &
			WithType<ScopedSchemaName<Scope, "Column">>;

		// Note: ideally this type would just leverage `InsertableObjectFromSchemaRecord<typeof columnFields>`,
		// but that results in broken `.d.ts` output due to a TypeScript bug.
		// See: https://github.com/microsoft/TypeScript/issues/58688.
		// Instead we extract and inline the typing of the "props" field here, which seems to sufficiently work around the issue.
		// type ColumnInsertableType = InsertableObjectFromSchemaRecord<typeof columnFields>;
		type ColumnInsertableType = InsertableObjectFromSchemaRecord<
			typeof columnFieldsBuiltInParts
		> &
			(FieldHasDefault<UnannotateImplicitFieldSchema<TPropsSchema>> extends true
				? // Note: The docs on the below properties are copied from `IColumn.props`' docs to ensure that the
					// documentation appears in the data insertion scenario.
					// The contents are duplicated instead of using `@inheritdoc`, as intellisense does not correctly
					// support `@inheritDoc`.
					// See: https://github.com/microsoft/TypeScript/issues/31267
					{
						/**
						 * The column's properties.
						 * @remarks This is a user-defined schema that can be used to store additional information about the column.
						 */
						props?: InsertableTreeFieldFromImplicitField<
							UnannotateImplicitFieldSchema<TPropsSchema>
						>;
					}
				: {
						/**
						 * The column's properties.
						 * @remarks This is a user-defined schema that can be used to store additional information about the column.
						 */
						props: InsertableTreeFieldFromImplicitField<
							UnannotateImplicitFieldSchema<TPropsSchema>
						>;
					});

		// Modified version of `Column` that ensures the constructor (and `createFromInsertable`) are
		// typed correctly in terms of our insertable type.
		// This lets us be selective in our type-cast for the value returned from this function,
		// preserving as much type-safety as we reasonably can.
		type ColumnSchemaModifiedType = Omit<
			// Use mapped type to omit the constructor
			{
				[Property in keyof typeof Column]: (typeof Column)[Property];
			},
			"createFromInsertable"
		> &
			(new (
				parameters: InternalTreeNode | ColumnInsertableType,
			) => Column) & {
				createFromInsertable(parameters: ColumnInsertableType): Column;
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
	 * @sealed @system @alpha
	 */
	export type ColumnSchemaBase<
		TScope extends string | undefined = string | undefined,
		TPropsSchema extends ImplicitAnnotatedFieldSchema = ImplicitAnnotatedFieldSchema,
	> = ReturnType<typeof createColumnSchema<TScope, TPropsSchema>>;

	// #endregion

	// #region Row

	/**
	 * Base options for creating table row schema.
	 * @remarks Includes parameters common to all row factory overloads.
	 * @system @alpha
	 */
	export type CreateRowOptionsBase<
		TSchemaFactory extends SchemaFactoryAlpha = SchemaFactoryAlpha,
		TCell extends ImplicitAllowedTypes = ImplicitAllowedTypes,
	> = OptionsWithSchemaFactory<TSchemaFactory> & OptionsWithCellSchema<TCell>;

	/**
	 * Factory for creating row schema.
	 * @sealed @alpha
	 */
	// eslint-disable-next-line @typescript-eslint/explicit-function-return-type -- Return type is too complex to be reasonable to specify
	export function createRowSchema<
		const TInputScope extends string | undefined,
		const TCellSchema extends ImplicitAllowedTypes,
		const TPropsSchema extends ImplicitAnnotatedFieldSchema,
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
			extends schemaFactory.objectAlpha("Row", rowFields, {
				// Will make it easier to evolve this schema in the future.
				allowUnknownOptionalFields: true,
			})
			implements TableSchema.Row<TCellSchema, TPropsSchema>
		{
			public getCell(columnOrId: TableSchema.Column | string): CellValueType | undefined {
				const columnId = typeof columnOrId === "string" ? columnOrId : columnOrId.id;
				return this.cells.get(columnId) as CellValueType | undefined;
			}

			public setCell(
				columnOrId: TableSchema.Column | string,
				value: CellInsertableType | undefined,
			): void {
				// TODO: throw if column does not exist in the owning table.

				const columnId = typeof columnOrId === "string" ? columnOrId : columnOrId.id;
				this.cells.set(columnId, value);
			}

			public removeCell(columnOrId: TableSchema.Column | string): CellValueType | undefined {
				// TODO: throw if column does not exist in the owning table.

				const columnId = typeof columnOrId === "string" ? columnOrId : columnOrId.id;

				const cell: CellValueType | undefined = this.cells.get(columnId);
				if (cell === undefined) {
					return undefined;
				}

				this.cells.delete(columnId);
				return cell;
			}
		}

		type RowValueType = TreeNode &
			TableSchema.Row<TCellSchema, TPropsSchema> &
			WithType<ScopedSchemaName<Scope, "Row">>;

		// Note: ideally this type would just leverage `InsertableObjectFromSchemaRecord<typeof rowFields>`,
		// but that results in broken `.d.ts` output due to a TypeScript bug.
		// See: https://github.com/microsoft/TypeScript/issues/58688.
		// Instead we extract and inline the typing of the "props" field here, which seems to sufficiently work around
		// the issue.
		// type RowInsertableType = InsertableObjectFromSchemaRecord<typeof rowFields>;
		type RowInsertableType = InsertableObjectFromSchemaRecord<typeof rowFieldsBuiltInParts> &
			(FieldHasDefault<UnannotateImplicitFieldSchema<TPropsSchema>> extends true
				? // Note: The docs on the below properties are copied from `IRow.props`' docs to ensure that the
					// documentation appears in the data insertion scenario.
					// The contents are duplicated instead of using `@inheritdoc`, as intellisense does not correctly
					// support `@inheritDoc`.
					// See: https://github.com/microsoft/TypeScript/issues/31267
					{
						/**
						 * The row's properties.
						 * @remarks This is a user-defined schema that can be used to store additional information
						 * about the row.
						 */
						props?: InsertableTreeFieldFromImplicitField<
							UnannotateImplicitFieldSchema<TPropsSchema>
						>;
					}
				: {
						/**
						 * The row's properties.
						 * @remarks This is a user-defined schema that can be used to store additional information
						 * about the row.
						 */
						props: InsertableTreeFieldFromImplicitField<
							UnannotateImplicitFieldSchema<TPropsSchema>
						>;
					});

		// Modified version of `Row` that ensures the constructor (and `createFromInsertable`) are
		// typed correctly in terms of our insertable type.
		// This lets us be selective in our type-cast for the value returned from this function,
		// preserving as much type-safety as we reasonably can.
		type RowSchemaModifiedType = Omit<
			// Use mapped type to omit the constructor
			{
				[Property in keyof typeof Row]: (typeof Row)[Property];
			},
			"createFromInsertable"
		> &
			(new (
				parameters: InternalTreeNode | RowInsertableType,
			) => Row) & {
				createFromInsertable(parameters: RowInsertableType): Row;
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
	 * @sealed @system @alpha
	 */
	export type RowSchemaBase<
		TScope extends string | undefined = string | undefined,
		TCellSchema extends ImplicitAllowedTypes = ImplicitAllowedTypes,
		TPropsSchema extends ImplicitAnnotatedFieldSchema = ImplicitAnnotatedFieldSchema,
	> = ReturnType<typeof createRowSchema<TScope, TCellSchema, TPropsSchema>>;

	// #endregion

	// #region Table

	/**
	 * Base options for creating table schema.
	 * @remarks Includes parameters common to all table factory overloads.
	 * @system @alpha
	 */
	export type TableFactoryOptionsBase<
		TSchemaFactory extends SchemaFactoryAlpha = SchemaFactoryAlpha,
		TCell extends ImplicitAllowedTypes = ImplicitAllowedTypes,
	> = OptionsWithSchemaFactory<TSchemaFactory> & OptionsWithCellSchema<TCell>;

	/**
	 * Factory for creating table schema.
	 * @system @alpha
	 */
	// eslint-disable-next-line @typescript-eslint/explicit-function-return-type -- Return type is too complex to be reasonable to specify
	export function createTableSchema<
		const TInputScope extends string | undefined,
		const TCellSchema extends ImplicitAllowedTypes,
		const TColumnSchema extends ColumnSchemaBase<TInputScope>,
		const TRowSchema extends RowSchemaBase<TInputScope, TCellSchema>,
	>(
		inputSchemaFactory: SchemaFactoryAlpha<TInputScope>,
		_cellSchema: TCellSchema,
		columnSchema: TColumnSchema,
		rowSchema: TRowSchema,
	) {
		const schemaFactory = inputSchemaFactory.scopedFactory(tableSchemaFactorySubScope);
		type Scope = ScopedSchemaName<TInputScope, typeof tableSchemaFactorySubScope>;

		type CellValueType = TreeNodeFromImplicitAllowedTypes<TCellSchema>;
		type ColumnValueType = TreeNodeFromImplicitAllowedTypes<TColumnSchema>;
		type RowValueType = TreeNodeFromImplicitAllowedTypes<TRowSchema>;

		/**
		 * {@link Table} fields.
		 * @remarks Extracted for re-use in returned type signature defined later in this function.
		 * The implicit typing is intentional.
		 */
		const tableFields = {
			rows: schemaFactory.array("Table.rows", rowSchema),
			columns: schemaFactory.array("Table.columns", columnSchema),
		} as const satisfies Record<string, ImplicitAnnotatedFieldSchema>;

		/**
		 * The Table schema
		 */
		class Table
			extends schemaFactory.objectAlpha("Table", tableFields, {
				// Will make it easier to evolve this schema in the future.
				allowUnknownOptionalFields: true,
			})
			implements TableSchema.Table<TCellSchema, TColumnSchema, TRowSchema>
		{
			public static empty<TThis extends TableConstructorType>(
				this: TThis,
			): InstanceType<TThis> {
				return new this({ columns: [], rows: [] }) as InstanceType<TThis>;
			}

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

			public getCell(
				key: TableSchema.CellKey<TColumnSchema, TRowSchema>,
			): CellValueType | undefined {
				const { column: columnOrId, row: rowOrId } = key;
				const row = this._getRow(rowOrId);
				if (row === undefined) {
					return undefined;
				}

				const column = this._getColumn(columnOrId);
				if (column === undefined) {
					return undefined;
				}

				return row.getCell(column);
			}

			public insertColumn({
				column,
				index,
			}: TableSchema.InsertColumnParameters<TColumnSchema>): ColumnValueType {
				const inserted = this.insertColumns({
					columns: [column],
					index,
				});
				return inserted[0] ?? oob();
			}

			public insertColumns({
				columns,
				index,
			}: TableSchema.InsertColumnsParameters<TColumnSchema>): ColumnValueType[] {
				// #region Input validation

				// Ensure index is valid
				if (index !== undefined) {
					Table.validateInsertionIndex(index, this.columns);
				}

				// Check all of the columns being inserted an ensure the table does not already contain any with the same ID.
				for (const column of columns) {
					// TypeScript is unable to narrow the type of the column type correctly here, hence the casts below.
					// See: https://github.com/microsoft/TypeScript/issues/52144
					const maybeId = (column as ColumnValueType).id;
					if (maybeId !== undefined && this.containsColumnWithId(maybeId)) {
						throw new UsageError(
							`A column with ID "${(column as ColumnValueType).id}" already exists in the table.`,
						);
					}
				}

				// #endregion

				// TypeScript is unable to narrow the column type correctly here, hence the casts below.
				// See: https://github.com/microsoft/TypeScript/issues/52144
				if (index === undefined) {
					// eslint-disable-next-line @typescript-eslint/no-explicit-any
					this.columns.insertAtEnd(TreeArrayNode.spread(columns) as any);
				} else {
					// eslint-disable-next-line @typescript-eslint/no-explicit-any
					this.columns.insertAt(index, TreeArrayNode.spread(columns) as any);
				}

				// Inserting the input nodes into the tree hydrates them, making them usable as nodes.
				return columns as unknown as ColumnValueType[];
			}

			public insertRow({
				row,
				index,
			}: TableSchema.InsertRowParameters<TRowSchema>): RowValueType {
				const inserted = this.insertRows({
					rows: [row],
					index,
				});
				return inserted[0] ?? oob();
			}

			public insertRows({
				index,
				rows,
			}: TableSchema.InsertRowsParameters<TRowSchema>): RowValueType[] {
				// #region Input validation

				// Ensure index is valid
				if (index !== undefined) {
					Table.validateInsertionIndex(index, this.rows);
				}

				// Note: TypeScript is unable to narrow the type of the row type correctly here, hence the casts below.
				// See: https://github.com/microsoft/TypeScript/issues/52144
				for (const newRow of rows) {
					// Check all of the rows being inserted an ensure the table does not already contain any with the same ID.
					const maybeId = (newRow as RowValueType).id;
					if (maybeId !== undefined && this.containsRowWithId(maybeId)) {
						throw new UsageError(
							`A row with ID "${(newRow as RowValueType).id}" already exists in the table.`,
						);
					}

					// If the row contains cells, verify that the table contains the columns for those cells.
					// Note: we intentionally hide `cells` on `IRow` to avoid leaking the internal data representation as much as possible, so we have to cast here.
					// eslint-disable-next-line @typescript-eslint/no-explicit-any
					if ((newRow as any).cells !== undefined) {
						// eslint-disable-next-line @typescript-eslint/no-explicit-any
						const keys: string[] = Object.keys((newRow as any).cells);
						for (const key of keys) {
							if (!this.containsColumnWithId(key)) {
								throw new UsageError(
									`Attempted to insert row a cell under column ID "${key}", but the table does not contain a column with that ID.`,
								);
							}
						}
					}
				}

				// #endregion

				// TypeScript is unable to narrow the row type correctly here, hence the casts below.
				// See: https://github.com/microsoft/TypeScript/issues/52144
				if (index === undefined) {
					// eslint-disable-next-line @typescript-eslint/no-explicit-any
					this.rows.insertAtEnd(TreeArrayNode.spread(rows) as any);
				} else {
					// eslint-disable-next-line @typescript-eslint/no-explicit-any
					this.rows.insertAt(index, TreeArrayNode.spread(rows) as any);
				}

				// Inserting the input nodes into the tree hydrates them, making them usable as nodes.
				return rows as unknown as RowValueType[];
			}

			public setCell({
				key,
				cell,
			}: TableSchema.SetCellParameters<TCellSchema, TColumnSchema, TRowSchema>): void {
				const { column: columnOrId, row: rowOrId } = key;

				const row = this._getRow(rowOrId);
				if (row === undefined) {
					const rowId = this._getRowId(rowOrId);
					throw new UsageError(`No row with ID "${rowId}" exists in the table.`);
				}

				const column = this._getColumn(columnOrId);
				if (column === undefined) {
					const columnId = this._getColumnId(columnOrId);
					throw new UsageError(`No column with ID "${columnId}" exists in the table.`);
				}

				row.setCell(column, cell);
			}

			public removeColumns(
				columns: readonly string[] | readonly ColumnValueType[],
			): ColumnValueType[] {
				// If there are no columns to remove, do nothing
				if (columns.length === 0) {
					return [];
				}

				// If there is only one column to remove, remove it (and don't incur cost of transaction)
				if (columns.length === 1) {
					const removedColumn = this.removeColumn(columns[0] ?? oob());
					return [removedColumn];
				}

				// If there are multiple columns to remove, remove them in a transaction.
				const removedColumns: ColumnValueType[] = [];
				Tree.runTransaction(this, () => {
					// Note, throwing an error within a transaction will abort the entire transaction.
					// So if we throw an error here for any row, no columns will be removed.
					for (const columnToRemove of columns) {
						const removedRow = this.removeColumn(columnToRemove);
						removedColumns.push(removedRow);
					}
				});
				return removedColumns;
			}

			public removeColumn(columnOrId: string | ColumnValueType): ColumnValueType {
				const column = this._getColumn(columnOrId);
				const index = column === undefined ? -1 : this.columns.indexOf(column);
				if (index === -1) {
					const columnId = this._getColumnId(columnOrId);
					throw new UsageError(
						`Specified column with ID "${columnId}" does not exist in the table.`,
					);
				}
				this.columns.removeAt(index);
				return column as ColumnValueType;
			}

			public removeAllColumns(): ColumnValueType[] {
				// TypeScript is unable to narrow the row type correctly here, hence the cast.
				// See: https://github.com/microsoft/TypeScript/issues/52144
				return this.removeColumns(this.columns as unknown as ColumnValueType[]);
			}

			public removeRows(rows: readonly string[] | readonly RowValueType[]): RowValueType[] {
				// If there are no rows to remove, do nothing
				if (rows.length === 0) {
					return [];
				}

				// If there is only one row to remove, remove it (and don't incur cost of transaction)
				if (rows.length === 1) {
					const removedRow = this.removeRow(rows[0] ?? oob());
					return [removedRow];
				}

				// If there are multiple rows to remove, remove them in a transaction.
				const removedRows: RowValueType[] = [];
				Tree.runTransaction(this, () => {
					// Note, throwing an error within a transaction will abort the entire transaction.
					// So if we throw an error here for any row, no rows will be removed.
					for (const rowToRemove of rows) {
						const removedRow = this.removeRow(rowToRemove);
						removedRows.push(removedRow);
					}
				});
				return removedRows;
			}

			public removeRow(rowOrId: string | RowValueType): RowValueType {
				const rowToRemove = this._getRow(rowOrId);
				const index = rowToRemove === undefined ? -1 : this.rows.indexOf(rowToRemove);

				// If the row does not exist in the table, throw an error.
				if (index === -1) {
					const rowId = this._getRowId(rowOrId);
					throw new UsageError(
						`Specified row with ID "${rowId}" does not exist in the table.`,
					);
				}

				this.rows.removeAt(index);
				return rowToRemove as RowValueType;
			}

			public removeAllRows(): RowValueType[] {
				// TypeScript is unable to narrow the row type correctly here, hence the cast.
				// See: https://github.com/microsoft/TypeScript/issues/52144
				return this.removeRows(this.rows as unknown as RowValueType[]);
			}

			public removeCell(
				key: TableSchema.CellKey<TColumnSchema, TRowSchema>,
			): CellValueType | undefined {
				const { column: columnOrId, row: rowOrId } = key;
				const row = this._getRow(rowOrId);
				if (row === undefined) {
					const rowId = this._getRowId(rowOrId);
					throw new UsageError(
						`Specified row with ID "${rowId}" does not exist in the table.`,
					);
				}

				const column = this._getColumn(columnOrId);
				if (column === undefined) {
					const columnId = this._getColumnId(columnOrId);
					throw new UsageError(
						`Specified column with ID "${columnId}" does not exist in the table.`,
					);
				}

				const cell: CellValueType | undefined = row.getCell(column.id);
				if (cell === undefined) {
					return undefined;
				}

				row.removeCell(column.id);
				return cell;
			}

			private _getColumn(columnOrId: string | ColumnValueType): ColumnValueType | undefined {
				return typeof columnOrId === "string" ? this.getColumn(columnOrId) : columnOrId;
			}

			private _getColumnId(columnOrId: string | ColumnValueType): string {
				return typeof columnOrId === "string" ? columnOrId : columnOrId.id;
			}

			private _getRow(rowOrId: string | RowValueType): RowValueType | undefined {
				return typeof rowOrId === "string" ? this.getRow(rowOrId) : rowOrId;
			}

			private _getRowId(rowOrId: string | RowValueType): string {
				return typeof rowOrId === "string" ? rowOrId : rowOrId.id;
			}

			private containsColumnWithId(columnId: string): boolean {
				// TypeScript is unable to narrow the types correctly here, hence the cast.
				// See: https://github.com/microsoft/TypeScript/issues/52144
				return (
					this.columns.find((column) => (column as TableSchema.Column).id === columnId) !==
					undefined
				);
			}

			private containsRowWithId(rowId: string): boolean {
				// TypeScript is unable to narrow the types correctly here, hence the cast.
				// See: https://github.com/microsoft/TypeScript/issues/52144
				return this.rows.find((row) => (row as TableSchema.Row).id === rowId) !== undefined;
			}

			/**
			 * Ensure that the specified index is a valid location for item insertion in the destination list.
			 * @throws Throws a usage error if the destination is invalid.
			 */
			private static validateInsertionIndex(
				index: number,
				destinationList: readonly unknown[],
			): void {
				if (index < 0) {
					throw new UsageError("The index must be greater than or equal to 0.");
				}

				if (index > destinationList.length) {
					throw new UsageError("The index specified for insertion is out of bounds.");
				}

				if (!Number.isInteger(index)) {
					throw new UsageError("The index must be an integer.");
				}
			}
		}

		type TableValueType = TreeNode &
			TableSchema.Table<TCellSchema, TColumnSchema, TRowSchema> &
			WithType<ScopedSchemaName<Scope, "Table">>;
		type TableInsertableType = InsertableObjectFromSchemaRecord<typeof tableFields>;
		type TableConstructorType = new (data: TableInsertableType) => TableValueType;

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
		> & {
			/**
			 * Create an empty table.
			 */
			empty<TThis extends TableConstructorType>(this: TThis): InstanceType<TThis>;
		} = Table;

		// Return the table schema
		return TableSchemaType;
	}

	/**
	 * Base row schema type.
	 * @sealed @system @alpha
	 */
	export type TableSchemaBase<
		TScope extends string | undefined,
		TCell extends ImplicitAllowedTypes,
		TColumn extends ColumnSchemaBase<TScope>,
		TRow extends RowSchemaBase<TScope, TCell>,
	> = ReturnType<typeof createTableSchema<TScope, TCell, TColumn, TRow>>;

	// #endregion
}

/**
 * Contains types and factories for creating schema to represent dynamic tabular data.
 *
 * @remarks
 *
 * WARNING: These APIs are in preview and are subject to change.
 * Until these APIs have stabilized, we do not recommend using them in production code.
 * We reserve the right to make breaking changes to these APIs, including their persisted data format.
 * Using these APIs in production code may result in data loss or corruption.
 *
 * Tables created using these APIs are...
 *
 * - sparse, meaning that cells may be omitted, and new rows are empty by default.
 *
 * - dynamic, meaning that their structure can be modified at runtime.
 * Columns and rows can be inserted, removed, modified, and reordered.
 * Cells can be inserted, removed, and modified.
 *
 * - row-major, meaning that operating on rows (including inserts, removal, moves, and traversal) is more efficient than operating on columns.
 *
 * Column and Row schema created using these APIs are extensible via the `props` field.
 * This allows association of additional properties with column and row nodes.
 *
 * Note: for now it is possible for table cells to become "orphaned".
 * That is, it is possible to enter a state where one or more rows contain cells with no corresponding column.
 * To help avoid this situation, you can manually remove corresponding cells when removing columns.
 * Either way, it is possible to enter such a state via the merging of edits.
 * For example: one client might add a row while another concurrently removes a column, orphaning the cell where the column and row intersected.
 *
 * @example Defining a Table schema
 *
 * ```typescript
 * class Table extends TableSchema.table({
 * 	schemaFactory,
 * 	cell: schemaFactory.string,
 * }) {}
 *
 * const table = new Table({
 * 	columns: [{ id: "column-0" }],
 * 	rows: [{ id: "row-0", cells: { "column-0": "Hello world!" } }],
 * });
 * ```
 *
 * @example Customizing Column and Row schema
 *
 * ```typescript
 * const Cell = schemaFactory.string;
 *
 * class ColumnProps extends schemaFactory.object("TableColumnProps", {
 * 	label: schemaFactory.string,
 * }) {}
 *
 * class Column extends TableSchema.column({
 * 	schemaFactory,
 * 	props: ColumnProps,
 * }) {}
 *
 * class Row extends TableSchema.row({
 * 	schemaFactory,
 * 	cell: Cell,
 * }) {}
 *
 * class Table extends TableSchema.table({
 * 	schemaFactory,
 * 	cell: Cell,
 * 	column: Column,
 * 	row: Row,
 * }) {}
 *
 * const table = new Table({
 * 	columns: [
 * 		new Column({ props: { label: "Entry" } }),
 * 		new Column({ props: { label: "Date" } }),
 * 		new Column({ props: { label: "Amount" } }),
 * 	],
 * 	rows: [],
 * });
 * ```
 *
 * @example Listening for changes in the table
 *
 * ```typescript
 * // Listen for any changes to the table and its children.
 * // The "treeChanged" event will fire when the associated node or any of its descendants change.
 * Tree.on(table, "treeChanged", () => {
 * 	// Respond to the change.
 * });
 * ```
 *
 * @example Listening for changes to the rows list only
 *
 * ```typescript
 * // Listen for any changes to the list of rows.
 * // The "nodeChanged" event will fire only when the specified node itself changes (i.e., its own properties change).
 * // In this case, the event will fire when a row is added or removed, or the order of the list is changed.
 * // But it won't fire when a row's properties change, or when the row's cells change, etc.
 * Tree.on(table.rows, "nodeChanged", () => {
 * 	// Respond to the change.
 * });
 * ```
 *
 * @example Removing column and cells in a transaction
 *
 * When removing a column, if you wish to ensure that all of its corresponding cells are also removed (and not
 * orphaned), you can remove the column and all of the relevant cells in a transaction.
 * Note that there are performance implications to this.
 *
 * ```typescript
 * // Remove column1 and all of its cells.
 * // The "transaction" method will ensure that all changes are applied atomically.
 * Tree.runTransaction(table, () => {
 * 	// Remove column1.
 * 	table.removeColumn(column1);
 *
 * 	// Remove the cell at column1 for each row.
 * 	for (const row of table.rows) {
 * 		table.removeCell({
 * 			column: column1,
 * 			row,
 * 		});
 * 	}
 * });
 * ```
 *
 * @privateRemarks
 * The above examples are backed by tests in `tableSchema.spec.ts`.
 * Those tests and these examples should be kept in-sync to ensure that the examples are correct.
 *
 * @alpha
 */
export namespace TableSchema {
	// #region Column

	/**
	 * A column in a table.
	 * @remarks Implemented by the schema class returned from {@link TableSchema.(column:2)}.
	 * @sealed @alpha
	 */
	export interface Column<
		TProps extends ImplicitAnnotatedFieldSchema = ImplicitAnnotatedFieldSchema,
	> {
		/**
		 * The unique identifier of the column.
		 * @remarks Uniquely identifies the node within the entire tree, not just the table.
		 */
		readonly id: string;

		/**
		 * The column's properties.
		 * @remarks This is a user-defined schema that can be used to store additional information about the column.
		 * @privateRemarks
		 * Note: these docs are duplicated on the inline type definitions in {@link System_TableSchema.createColumnSchema}.
		 * If you update the docs here, please also update the inline type definitions.
		 */
		get props(): TreeFieldFromImplicitField<UnannotateImplicitFieldSchema<TProps>>;
		set props(value: InsertableTreeFieldFromImplicitField<
			UnannotateImplicitFieldSchema<TProps>
		>);
	}

	/**
	 * Factory for creating new table column schema.
	 * @alpha
	 */
	export function column<const TScope extends string | undefined>(
		params: System_TableSchema.CreateColumnOptionsBase<SchemaFactoryAlpha<TScope>>,
	): System_TableSchema.ColumnSchemaBase<TScope, System_TableSchema.DefaultPropsType>;
	/**
	 * Factory for creating new table column schema.
	 * @alpha
	 */
	export function column<
		const TScope extends string | undefined,
		const TProps extends ImplicitAnnotatedFieldSchema,
	>(
		params: System_TableSchema.CreateColumnOptionsBase<SchemaFactoryAlpha<TScope>> & {
			/**
			 * Optional column properties.
			 */
			readonly props: TProps;
		},
	): System_TableSchema.ColumnSchemaBase<TScope, TProps>;
	/**
	 * Overload implementation
	 */
	export function column({
		schemaFactory,
		props = SchemaFactory.optional(SchemaFactory.null),
	}: System_TableSchema.CreateColumnOptionsBase & {
		readonly props?: ImplicitAnnotatedFieldSchema;
	}): TreeNodeSchema {
		return System_TableSchema.createColumnSchema(schemaFactory, props);
	}

	// #endregion

	// #region Row

	/**
	 * A row in a table.
	 * @remarks Implemented by the schema class returned from {@link TableSchema.(row:2)}.
	 * @sealed @alpha
	 */
	export interface Row<
		TCell extends ImplicitAllowedTypes = ImplicitAllowedTypes,
		TProps extends ImplicitAnnotatedFieldSchema = ImplicitAnnotatedFieldSchema,
	> {
		/**
		 * The unique identifier of the row.
		 * @remarks Uniquely identifies the node within the entire tree, not just the table.
		 */
		readonly id: string;

		/**
		 * Gets the cell in the specified column.
		 * @returns The cell if it exists, otherwise undefined.
		 * @privateRemarks TODO: throw if the column does not belong to the same table as the row.
		 */
		getCell(column: Column): TreeNodeFromImplicitAllowedTypes<TCell> | undefined;
		/**
		 * Gets the cell in the specified column, denoted by column ID.
		 * @returns The cell if it exists, otherwise undefined.
		 */
		getCell(columnId: string): TreeNodeFromImplicitAllowedTypes<TCell> | undefined;

		/**
		 * Sets the cell in the specified column.
		 * @remarks To remove a cell, call {@link TableSchema.Row.(removeCell:1)} instead.
		 * @privateRemarks TODO: Throw an error if the column does not exist in the table.
		 */
		setCell(column: Column, value: InsertableTreeNodeFromImplicitAllowedTypes<TCell>): void;
		/**
		 * Sets the cell in the specified column, denoted by column ID.
		 * @remarks To remove a cell, call {@link TableSchema.Row.(removeCell:2)} instead.
		 */
		setCell(columnId: string, value: InsertableTreeNodeFromImplicitAllowedTypes<TCell>): void;

		/**
		 * Removes the cell in the specified column.
		 * @returns The cell if it exists, otherwise undefined.
		 * @privateRemarks TODO: Throw if the column does not belong to the same table as the row.
		 */
		removeCell(column: Column): TreeNodeFromImplicitAllowedTypes<TCell> | undefined;
		/**
		 * Removes the cell in the specified column, denoted by column ID.
		 * @returns The cell if it exists, otherwise undefined.
		 */
		removeCell(columnId: string): TreeNodeFromImplicitAllowedTypes<TCell> | undefined;

		/**
		 * The row's properties.
		 * @remarks This is a user-defined schema that can be used to store additional information about the row.
		 * @privateRemarks
		 * Note: these docs are duplicated on the inline type definitions in {@link System_TableSchema.createRowSchema}.
		 * If you update the docs here, please also update the inline type definitions.
		 */
		get props(): TreeFieldFromImplicitField<UnannotateImplicitFieldSchema<TProps>>;
		set props(value: InsertableTreeFieldFromImplicitField<
			UnannotateImplicitFieldSchema<TProps>
		>);
	}

	/**
	 * Factory for creating new table column schema.
	 * @alpha
	 */
	export function row<
		const TScope extends string | undefined,
		const TCell extends ImplicitAllowedTypes,
	>(
		params: System_TableSchema.CreateRowOptionsBase<SchemaFactoryAlpha<TScope>, TCell>,
	): System_TableSchema.RowSchemaBase<TScope, TCell, System_TableSchema.DefaultPropsType>;
	/**
	 * Factory for creating new table row schema.
	 * @alpha
	 */
	export function row<
		const TScope extends string | undefined,
		const TCell extends ImplicitAllowedTypes,
		const TProps extends ImplicitAnnotatedFieldSchema,
	>(
		params: System_TableSchema.CreateRowOptionsBase<SchemaFactoryAlpha<TScope>, TCell> & {
			/**
			 * Optional row properties.
			 */
			readonly props: TProps;
		},
	): System_TableSchema.RowSchemaBase<TScope, TCell, TProps>;
	/**
	 * Overload implementation
	 */
	export function row({
		schemaFactory,
		cell,
		props = SchemaFactory.optional(SchemaFactory.null),
	}: System_TableSchema.CreateRowOptionsBase & {
		readonly props?: ImplicitAnnotatedFieldSchema;
	}): TreeNodeSchema {
		return System_TableSchema.createRowSchema(schemaFactory, cell, props);
	}

	// #endregion

	// #region Table

	/**
	 * A key to uniquely identify a cell within a table.
	 * @alpha
	 */
	export interface CellKey<
		TColumn extends ImplicitAllowedTypes,
		TRow extends ImplicitAllowedTypes,
	> {
		/**
		 * {@link TableSchema.Column} or {@link TableSchema.Column.id} at which the cell is located.
		 */
		readonly column: string | TreeNodeFromImplicitAllowedTypes<TColumn>;

		/**
		 * {@link TableSchema.Row} or {@link TableSchema.Row.id} at which the cell is located.
		 */
		readonly row: string | TreeNodeFromImplicitAllowedTypes<TRow>;
	}

	/**
	 * {@link TableSchema.Table.insertColumn} parameters.
	 * @alpha
	 */
	export interface InsertColumnParameters<TColumn extends ImplicitAllowedTypes> {
		/**
		 * The index at which to insert the new column.
		 * @remarks If not provided, the column will be appended to the end of the table.
		 */
		readonly index?: number | undefined;

		/**
		 * The column to insert.
		 */
		readonly column: InsertableTreeNodeFromImplicitAllowedTypes<TColumn>;
	}

	/**
	 * {@link TableSchema.Table.insertColumns} parameters.
	 * @alpha
	 */
	export interface InsertColumnsParameters<TColumn extends ImplicitAllowedTypes> {
		/**
		 * The index at which to insert the new columns.
		 * @remarks If not provided, the columns will be appended to the end of the table.
		 */
		readonly index?: number | undefined;

		/**
		 * The columns to insert.
		 */
		readonly columns: InsertableTreeNodeFromImplicitAllowedTypes<TColumn>[];
	}

	/**
	 * {@link TableSchema.Table.insertRow} parameters.
	 * @alpha
	 */
	export interface InsertRowParameters<TRow extends ImplicitAllowedTypes> {
		/**
		 * The index at which to insert the new row.
		 * @remarks If not provided, the row will be appended to the end of the table.
		 */
		readonly index?: number | undefined;

		/**
		 * The row to insert.
		 */
		readonly row: InsertableTreeNodeFromImplicitAllowedTypes<TRow>;
	}

	/**
	 * {@link TableSchema.Table.insertRows} parameters.
	 * @alpha
	 */
	export interface InsertRowsParameters<TRow extends ImplicitAllowedTypes> {
		/**
		 * The index at which to insert the new rows.
		 * @remarks If not provided, the rows will be appended to the end of the table.
		 */
		readonly index?: number | undefined;

		/**
		 * The rows to insert.
		 */
		readonly rows: InsertableTreeNodeFromImplicitAllowedTypes<TRow>[];
	}

	/**
	 * {@link TableSchema.Table.setCell} parameters.
	 * @alpha
	 */
	export interface SetCellParameters<
		TCell extends ImplicitAllowedTypes,
		TColumn extends ImplicitAllowedTypes,
		TRow extends ImplicitAllowedTypes,
	> {
		/**
		 * The key to uniquely identify a cell in a table.
		 */
		readonly key: CellKey<TColumn, TRow>;

		/**
		 * The cell to set.
		 */
		readonly cell: InsertableTreeNodeFromImplicitAllowedTypes<TCell>;
	}

	/**
	 * A table.
	 * @sealed @alpha
	 */
	export interface Table<
		TCell extends ImplicitAllowedTypes,
		TColumn extends ImplicitAllowedTypes,
		TRow extends ImplicitAllowedTypes,
	> {
		/**
		 * The table's columns.
		 */
		readonly columns: TreeArrayNode<TColumn>;

		/**
		 * The table's rows.
		 */
		readonly rows: TreeArrayNode<TRow>;

		/**
		 * Gets a table column by its {@link TableSchema.Column.id}.
		 */
		getColumn(id: string): TreeNodeFromImplicitAllowedTypes<TColumn> | undefined;

		/**
		 * Gets a table row by its {@link TableSchema.Row.id}.
		 */
		getRow(id: string): TreeNodeFromImplicitAllowedTypes<TRow> | undefined;

		/**
		 * Gets a cell in the table by column and row IDs.
		 * @param key - A key that uniquely distinguishes a cell in the table, represented as a combination of the column ID and row ID.
		 */
		getCell(key: CellKey<TColumn, TRow>): TreeNodeFromImplicitAllowedTypes<TCell> | undefined;

		/**
		 * Inserts a column into the table.
		 *
		 * @throws
		 * Throws an error in the following cases:
		 *
		 * - The column, or a column with the same ID is already in the tree.
		 *
		 * - The specified index is out of range.
		 *
		 * No column is inserted in these cases.
		 */
		insertColumn(
			params: InsertColumnParameters<TColumn>,
		): TreeNodeFromImplicitAllowedTypes<TColumn>;

		/**
		 * Inserts 0 or more columns into the table.
		 *
		 * @throws
		 * Throws an error in the following cases:
		 *
		 * - At least one column, or a column with the same ID is already in the tree.
		 *
		 * - The specified index is out of range.
		 *
		 * No columns are inserted in these cases.
		 */
		insertColumns(
			params: InsertColumnsParameters<TColumn>,
		): TreeNodeFromImplicitAllowedTypes<TColumn>[];

		/**
		 * Inserts a row into the table.
		 *
		 * @throws
		 * Throws an error in the following cases:
		 *
		 * - The row, or a row with the same ID is already in the tree.
		 *
		 * - The row contains cells, but the table does not contain matching columns for one or more of those cells.
		 *
		 * - The specified index is out of range.
		 *
		 * No row is inserted in these cases.
		 */
		insertRow(params: InsertRowParameters<TRow>): TreeNodeFromImplicitAllowedTypes<TRow>;

		/**
		 * Inserts 0 or more rows into the table.
		 *
		 * @throws
		 * Throws an error in the following cases:
		 *
		 * - At least one row, or a row with the same ID is already in the tree.
		 *
		 * - The row contains cells, but the table does not contain matching columns for one or more of those cells.
		 *
		 * - The specified index is out of range.
		 *
		 * No rows are inserted in these cases.
		 */
		insertRows(params: InsertRowsParameters<TRow>): TreeNodeFromImplicitAllowedTypes<TRow>[];

		/**
		 * Sets the cell at the specified location in the table.
		 * @remarks To remove a cell, call {@link TableSchema.Table.removeCell} instead.
		 */
		setCell(params: SetCellParameters<TCell, TColumn, TRow>): void;

		/**
		 * Removes the specified column from the table.
		 *
		 * @remarks
		 * Note: this does not remove any cells from the table's rows.
		 * To remove the corresponding cells, use {@link TableSchema.Table.removeCell}.
		 *
		 * @param column - The {@link TableSchema.Column | column} or {@link TableSchema.Column.id | column ID} to remove.
		 * @throws Throws an error if the column is not in the table.
		 * @privateRemarks TODO (future): Actually remove corresponding cells from table rows.
		 */
		removeColumn(
			column: string | TreeNodeFromImplicitAllowedTypes<TColumn>,
		): TreeNodeFromImplicitAllowedTypes<TColumn>;

		/**
		 * Removes 0 or more columns from the table.
		 *
		 * @remarks
		 * Note: this does not remove any cells from the table's rows.
		 * To remove the corresponding cells, use {@link TableSchema.Table.removeCell}.
		 *
		 * @param columns - The columns to remove.
		 * @throws Throws an error if any of the columns are not in the table.
		 * In this case, no columns are removed.
		 */
		removeColumns(
			columns: readonly TreeNodeFromImplicitAllowedTypes<TColumn>[],
		): TreeNodeFromImplicitAllowedTypes<TColumn>[];
		/**
		 * Removes 0 or more columns from the table.
		 *
		 * @remarks
		 * Note: this does not remove any cells from the table's rows.
		 * To remove the corresponding cells, use {@link TableSchema.Table.removeCell}.
		 *
		 * @param columns - The columns to remove, specified by their {@link TableSchema.Column.id}.
		 * @throws Throws an error if any of the columns are not in the table.
		 * In this case, no columns are removed.
		 */
		removeColumns(columns: readonly string[]): TreeNodeFromImplicitAllowedTypes<TColumn>[];

		/**
		 * Removes all columns from the table.
		 * @returns The removed columns.
		 */
		removeAllColumns(): TreeNodeFromImplicitAllowedTypes<TColumn>[];

		/**
		 * Removes the specified row from the table.
		 * @param row - The {@link TableSchema.Row | row} or {@link TableSchema.Row.id | row ID} to remove.
		 * @throws Throws an error if the row is not in the table.
		 */
		removeRow(
			row: string | TreeNodeFromImplicitAllowedTypes<TRow>,
		): TreeNodeFromImplicitAllowedTypes<TRow>;

		/**
		 * Removes 0 or more rows from the table.
		 * @param rows - The rows to remove.
		 * @throws Throws an error if any of the rows are not in the table.
		 * In this case, no rows are removed.
		 */
		removeRows(
			rows: readonly TreeNodeFromImplicitAllowedTypes<TRow>[],
		): TreeNodeFromImplicitAllowedTypes<TRow>[];
		/**
		 * Removes 0 or more rows from the table.
		 * @param rows - The rows to remove, specified by their {@link TableSchema.Row.id}.
		 * @throws Throws an error if any of the rows are not in the table.
		 * In this case, no rows are removed.
		 */
		removeRows(rows: readonly string[]): TreeNodeFromImplicitAllowedTypes<TRow>[];

		/**
		 * Removes all rows from the table.
		 * @returns The removed rows.
		 */
		removeAllRows(): TreeNodeFromImplicitAllowedTypes<TRow>[];

		/**
		 * Removes the cell at the specified location in the table.
		 * @returns The cell if it exists, otherwise undefined.
		 * @throws Throws an error if the location does not exist in the table.
		 */
		removeCell(
			key: CellKey<TColumn, TRow>,
		): TreeNodeFromImplicitAllowedTypes<TCell> | undefined;
	}

	/**
	 * Factory for creating new table schema.
	 * @alpha
	 */
	export function table<
		const TScope extends string | undefined,
		const TCell extends ImplicitAllowedTypes,
	>(
		params: System_TableSchema.TableFactoryOptionsBase<SchemaFactoryAlpha<TScope>, TCell>,
	): System_TableSchema.TableSchemaBase<
		TScope,
		TCell,
		System_TableSchema.ColumnSchemaBase<TScope, System_TableSchema.DefaultPropsType>,
		System_TableSchema.RowSchemaBase<TScope, TCell, System_TableSchema.DefaultPropsType>
	>;
	/**
	 * Factory for creating new table schema with custom column schema.
	 * @alpha
	 */
	export function table<
		const TScope extends string | undefined,
		const TCell extends ImplicitAllowedTypes,
		const TColumn extends System_TableSchema.ColumnSchemaBase<TScope>,
	>(
		params: System_TableSchema.TableFactoryOptionsBase<SchemaFactoryAlpha<TScope>, TCell> & {
			readonly column: TColumn;
		},
	): System_TableSchema.TableSchemaBase<
		TScope,
		TCell,
		TColumn,
		System_TableSchema.RowSchemaBase<TScope, TCell, System_TableSchema.DefaultPropsType>
	>;
	/**
	 * Factory for creating new table schema with custom row schema.
	 * @alpha
	 */
	export function table<
		const TScope extends string | undefined,
		const TCell extends ImplicitAllowedTypes,
		const TRow extends System_TableSchema.RowSchemaBase<TScope, TCell>,
	>(
		params: System_TableSchema.TableFactoryOptionsBase<SchemaFactoryAlpha<TScope>, TCell> & {
			readonly row: TRow;
		},
	): System_TableSchema.TableSchemaBase<
		TScope,
		TCell,
		System_TableSchema.ColumnSchemaBase<TScope, System_TableSchema.DefaultPropsType>,
		TRow
	>;
	/**
	 * Factory for creating new table schema with custom column and row schema.
	 * @alpha
	 */
	export function table<
		const TScope extends string | undefined,
		const TCell extends ImplicitAllowedTypes,
		const TRow extends System_TableSchema.RowSchemaBase<TScope, TCell>,
	>(
		params: System_TableSchema.TableFactoryOptionsBase<SchemaFactoryAlpha<TScope>, TCell> & {
			readonly row: TRow;
		},
	): System_TableSchema.TableSchemaBase<
		TScope,
		TCell,
		System_TableSchema.ColumnSchemaBase<TScope, System_TableSchema.DefaultPropsType>,
		TRow
	>;
	/**
	 * Factory for creating new table schema with custom column and row schema.
	 * @alpha
	 */
	export function table<
		const TScope extends string | undefined,
		const TCell extends ImplicitAllowedTypes,
		const TColumn extends System_TableSchema.ColumnSchemaBase<TScope>,
		const TRow extends System_TableSchema.RowSchemaBase<TScope, TCell>,
	>(
		params: System_TableSchema.TableFactoryOptionsBase<SchemaFactoryAlpha<TScope>, TCell> & {
			readonly column: TColumn;
			readonly row: TRow;
		},
	): System_TableSchema.TableSchemaBase<TScope, TCell, TColumn, TRow>;
	/**
	 * Overload implementation
	 */
	export function table({
		schemaFactory,
		cell: cellSchema,
		column: columnSchema = column({
			schemaFactory,
		}),
		row: rowSchema = row({
			schemaFactory,
			cell: cellSchema,
		}),
	}: System_TableSchema.TableFactoryOptionsBase & {
		readonly column?: System_TableSchema.ColumnSchemaBase;
		readonly row?: System_TableSchema.RowSchemaBase;
	}): TreeNodeSchema {
		return System_TableSchema.createTableSchema(
			schemaFactory,
			cellSchema,
			columnSchema,
			rowSchema,
		);
	}

	// #endregion
}
