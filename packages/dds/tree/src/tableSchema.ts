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
	type FieldSchema,
	type FieldKind,
	SchemaFactory,
	type ImplicitAnnotatedFieldSchema,
	type UnannotateImplicitFieldSchema,
} from "./simple-tree/index.js";

// Future improvement TODOs (ideally to be done before promoting these APIs to `@alpha`):
// - Record-like type parameters / input parameters?
// - Omit `props` properties from Row and Column schemas when not provided?

const tableSchemaFactorySubScope = "table";

/**
 * Not intended for use outside of this package.
 *
 * @privateRemarks
 * This namespace is a collection of internal system types relate to {@link TableSchema}.
 * This namespace should be strictly type-exported by the package.
 * All members should be tagged with `@system`.
 *
 * @system @internal
 */
export namespace System_TableSchema {
	/**
	 * A base interface for factory input options which include an schema factory.
	 * @remarks This interface should not be referenced directly.
	 * @privateRemarks This interface primarily exists to provide a single home for property documentation.
	 * @system @internal
	 */
	export interface OptionsWithSchemaFactory<
		TScope extends string | undefined = string | undefined,
	> {
		/**
		 * Schema factory with which the Column schema will be associated.
		 * @remarks Can be used to associate the resulting schema with an existing {@link SchemaFactory.scope|scope}.
		 */
		readonly schemaFactory: SchemaFactoryAlpha<TScope>;
	}

	/**
	 * A base interface for factory input options which include the table cell schema.
	 * @remarks This interface should not be referenced directly.
	 * @privateRemarks This interface primarily exists to provide a single home for property documentation.
	 * @system @internal
	 */
	export interface OptionsWithCellSchema<
		TCellSchema extends ImplicitAllowedTypes = ImplicitAllowedTypes,
	> {
		/**
		 * Schema for the table's cells.
		 */
		readonly cell: TCellSchema;
	}

	// #region Column

	/**
	 * Base options for creating table cow schema.
	 * @remarks Includes parameters common to all column factory overloads.
	 * @system @internal
	 */
	export type CreateColumnOptionsBase<
		TInputScope extends string | undefined = string | undefined,
	> = OptionsWithSchemaFactory<TInputScope>;

	/**
	 * Factory for creating new table column schema.
	 * @system @internal
	 */
	// eslint-disable-next-line @typescript-eslint/explicit-function-return-type -- Return type is too complex to be reasonable to specify
	export function createColumnInternal<
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
			implements TableSchema.IColumn<TPropsSchema> {}

		type ColumnValueType = TreeNode &
			TableSchema.IColumn<TPropsSchema> &
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
				? // Note: The docs on the below properties are copied from `IRow.props`' docs to ensure that the
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
	 * @sealed @system @internal
	 */
	export type ColumnSchemaBase<
		TScope extends string | undefined = string | undefined,
		TPropsSchema extends ImplicitFieldSchema = ImplicitFieldSchema,
	> = ReturnType<typeof TableSchema.createColumn<TScope, TPropsSchema>>;

	// #endregion

	// #region Row

	/**
	 * Base options for creating table row schema.
	 * @remarks Includes parameters common to all row factory overloads.
	 * @system @internal
	 */
	export type CreateRowOptionsBase<
		TScope extends string | undefined = string | undefined,
		TCell extends ImplicitAllowedTypes = ImplicitAllowedTypes,
	> = OptionsWithSchemaFactory<TScope> & OptionsWithCellSchema<TCell>;

	/**
	 * Factory for creating new table row schema.
	 *
	 * @sealed @internal
	 */
	// eslint-disable-next-line @typescript-eslint/explicit-function-return-type -- Return type is too complex to be reasonable to specify
	export function createRowInternal<
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
			extends schemaFactory.objectAlpha("Row", rowFields, {
				// Will make it easier to evolve this schema in the future.
				allowUnknownOptionalFields: true,
			})
			implements TableSchema.IRow<TCellSchema, TPropsSchema>
		{
			public getCell(columnOrId: TableSchema.IColumn | string): CellValueType | undefined {
				const columnId = typeof columnOrId === "string" ? columnOrId : columnOrId.id;
				return this.cells.get(columnId) as CellValueType | undefined;
			}

			public setCell(
				columnOrId: TableSchema.IColumn | string,
				value: CellInsertableType | undefined,
			): void {
				const columnId = typeof columnOrId === "string" ? columnOrId : columnOrId.id;
				this.cells.set(columnId, value);
			}

			public removeCell(columnOrId: TableSchema.IColumn | string): CellValueType | undefined {
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
			TableSchema.IRow<TCellSchema, TPropsSchema> &
			WithType<ScopedSchemaName<Scope, "Row">>;

		// Note: ideally this type would just leverage `InsertableObjectFromSchemaRecord<typeof rowFields>`,
		// but that results in broken `.d.ts` output due to a TypeScript bug.
		// See: https://github.com/microsoft/TypeScript/issues/58688.
		// Instead we extract and inline the typing of the "props" field here, which seems to sufficiently work around
		// the issue.
		// type RowInsertableType = InsertableObjectFromSchemaRecord<typeof rowFields>;
		type RowInsertableType = InsertableObjectFromSchemaRecord<typeof rowFieldsBuiltInParts> &
			(FieldHasDefault<TPropsSchema> extends true
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
						props?: InsertableTreeFieldFromImplicitField<TPropsSchema>;
					}
				: {
						/**
						 * The row's properties.
						 * @remarks This is a user-defined schema that can be used to store additional information
						 * about the row.
						 */
						props: InsertableTreeFieldFromImplicitField<TPropsSchema>;
					});

		// Modified version of `Column` that ensures the constructor (and `createFromInsertable`) are
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
	 * @sealed @system @internal
	 */
	export type RowSchemaBase<
		TScope extends string | undefined = string | undefined,
		TCellSchema extends ImplicitAllowedTypes = ImplicitAllowedTypes,
		TPropsSchema extends ImplicitFieldSchema = ImplicitFieldSchema,
	> = ReturnType<typeof TableSchema.createRow<TScope, TCellSchema, TPropsSchema>>;

	// #endregion

	// #region Table

	/**
	 * Base options for creating table schema.
	 * @remarks Includes parameters common to all table factory overloads.
	 * @system @internal
	 */
	export type TableFactoryOptionsBase<
		TScope extends string | undefined = string | undefined,
		TCell extends ImplicitAllowedTypes = ImplicitAllowedTypes,
	> = OptionsWithSchemaFactory<TScope> & OptionsWithCellSchema<TCell>;

	/**
	 * Factory for creating new table schema.
	 * @system @internal
	 */
	// eslint-disable-next-line @typescript-eslint/explicit-function-return-type -- Return type is too complex to be reasonable to specify
	export function createTableInternal<
		const TInputScope extends string | undefined,
		const TCellSchema extends ImplicitAllowedTypes,
		const TColumnSchema extends ColumnSchemaBase<TInputScope> = ColumnSchemaBase<TInputScope>,
		const TRowSchema extends RowSchemaBase<TInputScope, TCellSchema> = RowSchemaBase<
			TInputScope,
			TCellSchema
		>,
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
		} as const satisfies Record<string, ImplicitFieldSchema>;

		/**
		 * The Table schema
		 */
		class Table
			extends schemaFactory.objectAlpha("Table", tableFields, {
				// Will make it easier to evolve this schema in the future.
				allowUnknownOptionalFields: true,
			})
			implements TableSchema.ITable<TCellSchema, TColumnSchema, TRowSchema>
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

			public getCell(key: TableSchema.CellKey): CellValueType | undefined {
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
			}: TableSchema.InsertColumnParameters<TColumnSchema>): ColumnValueType {
				// #region Input validation

				// TypeScript is unable to narrow the type of the column node correctly here, hence the cast.
				// See: https://github.com/microsoft/TypeScript/issues/52144
				const maybeId = (column as TableSchema.IColumn).id;

				// Ensure that no column with the same ID already exists in the table.
				if (maybeId !== undefined && this.containsColumnWithId(maybeId)) {
					throw new UsageError(`A column with ID "${maybeId}" already exists in the table.`);
				}

				// #endregion

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
			}: TableSchema.InsertRowsParameters<TRowSchema>): RowValueType[] {
				// #region Input validation

				// Check all of the rows being inserted an ensure the table does not already contain any with the same ID.
				for (const newRow of rows) {
					// TypeScript is unable to narrow the type of the row node correctly here, hence the cast.
					// See: https://github.com/microsoft/TypeScript/issues/52144
					const maybeId = (newRow as TableSchema.IRow).id;
					if (maybeId !== undefined && this.containsRowWithId(maybeId)) {
						throw new UsageError(
							`A row with ID "${(newRow as TableSchema.IRow).id}" already exists in the table.`,
						);
					}
				}

				// #endregion

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

			public setCell({ key, cell }: TableSchema.SetCellParameters<TCellSchema>): void {
				const { columnId, rowId } = key;
				const row = this.getRow(rowId);
				if (row === undefined) {
					throw new UsageError(`No row with ID "${rowId}" exists in the table.`);
				}

				const column = this.getColumn(columnId);
				if (column === undefined) {
					throw new UsageError(`No column with ID "${columnId}" exists in the table.`);
				}

				row.setCell(column.id, cell);
			}

			public removeColumn(columnToRemove: ColumnValueType): void {
				const index = this.columns.indexOf(columnToRemove);
				if (index === -1) {
					throw new UsageError(
						`Specified column with ID "${columnToRemove.id}" does not exist in the table.`,
					);
				}
				this.columns.removeAt(index);
			}

			public removeRows(rowsToRemove: readonly RowValueType[]): void {
				// If there are no rows to remove, do nothing
				if (rowsToRemove.length === 0) {
					return;
				}

				// If there is only one row to remove, remove it (and don't incur cost of transaction)
				if (rowsToRemove.length === 1) {
					const rowToRemove = rowsToRemove[0] ?? oob();
					const index = this.rows.indexOf(rowToRemove);

					// If the row
					if (index === -1) {
						throw new UsageError(
							`Specified row with ID "${rowToRemove.id}" does not exist in the table.`,
						);
					}

					this.rows.removeAt(index);
					return;
				}

				// If there are multiple rows to remove, remove them in a transaction.
				Tree.runTransaction(this, () => {
					for (const rowToRemove of rowsToRemove) {
						const index = this.rows.indexOf(rowToRemove);
						if (index === -1) {
							throw new UsageError(
								`Specified row with ID "${rowToRemove.id}" does not exist in the table.`,
							);
						}
						this.rows.removeAt(index);
					}
				});
			}

			public removeAllRows(): void {
				this.rows.removeRange();
			}

			public removeCell(key: TableSchema.CellKey): CellValueType | undefined {
				const { columnId, rowId } = key;
				const row = this.getRow(rowId);
				if (row === undefined) {
					throw new UsageError(
						`Specified row with ID "${rowId}" does not exist in the table.`,
					);
				}

				const column = this.getColumn(columnId);
				if (column === undefined) {
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

			private containsColumnWithId(columnId: string): boolean {
				// TypeScript is unable to narrow the types correctly here, hence the cast.
				// See: https://github.com/microsoft/TypeScript/issues/52144
				return (
					this.columns.find((column) => (column as TableSchema.IColumn).id === columnId) !==
					undefined
				);
			}

			private containsRowWithId(rowId: string): boolean {
				// TypeScript is unable to narrow the types correctly here, hence the cast.
				// See: https://github.com/microsoft/TypeScript/issues/52144
				return this.rows.find((row) => (row as TableSchema.IRow).id === rowId) !== undefined;
			}
		}

		type TableValueType = TreeNode &
			TableSchema.ITable<TCellSchema, TColumnSchema, TRowSchema> &
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
		TRow extends RowSchemaBase<TScope, TCell, ImplicitAllowedTypes> = RowSchemaBase<
			TScope,
			TCell,
			ImplicitAllowedTypes
		>,
	> = ReturnType<typeof TableSchema.createTable<TScope, TCell, TColumn, TRow>>;

	// #endregion
}

/**
 * Contains types and factories for creating schema to represent dynamic tabular data.
 * @privateRemarks TODO: document in more detail and add `@example`s.
 * @internal
 */
export namespace TableSchema {
	// #region Column

	/**
	 * A column in a table.
	 * @remarks Implemented by the schema class returned from {@link TableSchema.(createColumn:2)}.
	 * @sealed @internal
	 */
	export interface IColumn<
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
		 * Note: these docs are duplicated on the inline type definitions in {@link createColumn}.
		 * If you update the docs here, please also update the inline type definitions.
		 */
		get props(): TreeFieldFromImplicitField<UnannotateImplicitFieldSchema<TProps>> | undefined;
		set props(value: InsertableTreeFieldFromImplicitField<
			UnannotateImplicitFieldSchema<TProps>
		>);
	}

	/**
	 * Factory for creating new table column schema.
	 * @internal
	 */
	export function createColumn<const TScope extends string | undefined>({
		schemaFactory,
	}: System_TableSchema.CreateColumnOptionsBase<TScope>): ReturnType<
		typeof System_TableSchema.createColumnInternal<
			TScope,
			FieldSchema<FieldKind.Optional, typeof SchemaFactoryAlpha.null>
		>
	>;
	/**
	 * Factory for creating new table column schema.
	 * @internal
	 */
	export function createColumn<
		const TScope extends string | undefined,
		const TProps extends ImplicitFieldSchema,
	>({
		schemaFactory,
		props,
	}: System_TableSchema.CreateColumnOptionsBase<TScope> & {
		/**
		 * Optional column properties.
		 */
		readonly props: TProps;
	}): ReturnType<typeof System_TableSchema.createColumnInternal<TScope, TProps>>;
	/**
	 * Overload implementation
	 */
	export function createColumn({
		schemaFactory,
		props = SchemaFactory.optional(SchemaFactory.null),
	}: System_TableSchema.CreateColumnOptionsBase & {
		readonly props?: ImplicitFieldSchema;
	}): TreeNodeSchema {
		return System_TableSchema.createColumnInternal(schemaFactory, props);
	}

	// #endregion

	// #region Row

	/**
	 * A row in a table.
	 * @remarks Implemented by the schema class returned from {@link TableSchema.(createRow:2)}.
	 * @sealed @internal
	 */
	export interface IRow<
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
		getCell(column: IColumn): TreeNodeFromImplicitAllowedTypes<TCell> | undefined;
		/**
		 * Gets the cell in the specified column, denoted by column ID.
		 * @returns The cell if it exists, otherwise undefined.
		 * @privateRemarks TODO: throw if the column does not belong to the same table as the row.
		 */
		getCell(columnId: string): TreeNodeFromImplicitAllowedTypes<TCell> | undefined;

		/**
		 * Sets the cell in the specified column.
		 * @remarks To remove a cell, call {@link TableSchema.IRow.(removeCell:1)} instead.
		 * @privateRemarks TODO: Throw an error if the column does not exist in the table.
		 */
		setCell(column: IColumn, value: InsertableTreeNodeFromImplicitAllowedTypes<TCell>): void;
		/**
		 * Sets the cell in the specified column, denoted by column ID.
		 * @remarks To remove a cell, call {@link TableSchema.IRow.(removeCell:2)} instead.
		 * @privateRemarks TODO: Throw an error if the column does not exist in the table.
		 */
		setCell(columnId: string, value: InsertableTreeNodeFromImplicitAllowedTypes<TCell>): void;

		/**
		 * Removes the cell in the specified column.
		 * @returns The cell if it exists, otherwise undefined.
		 * @privateRemarks
		 * TODO:
		 * - Throw if the column does not belong to the same table as the row.
		 */
		removeCell(column: IColumn): TreeNodeFromImplicitAllowedTypes<TCell> | undefined;
		/**
		 * Removes the cell in the specified column, denoted by column ID.
		 * @returns The cell if it exists, otherwise undefined.
		 */
		removeCell(columnId: string): TreeNodeFromImplicitAllowedTypes<TCell> | undefined;

		/**
		 * The row's properties.
		 * @remarks This is a user-defined schema that can be used to store additional information about the row.
		 * @privateRemarks
		 * Note: these docs are duplicated on the inline type definitions in {@link createColumn}.
		 * If you update the docs here, please also update the inline type definitions.
		 */
		get props(): TreeFieldFromImplicitField<UnannotateImplicitFieldSchema<TProps>>;
		set props(value: InsertableTreeFieldFromImplicitField<
			UnannotateImplicitFieldSchema<TProps>
		>);
	}

	/**
	 * Factory for creating new table column schema.
	 * @internal
	 */
	export function createRow<
		const TScope extends string | undefined,
		const TCell extends ImplicitAllowedTypes,
	>({
		schemaFactory,
		cell,
	}: System_TableSchema.CreateRowOptionsBase<TScope, TCell>): ReturnType<
		typeof System_TableSchema.createRowInternal<
			TScope,
			TCell,
			FieldSchema<FieldKind.Optional, typeof SchemaFactoryAlpha.null>
		>
	>;
	/**
	 * Factory for creating new table column schema.
	 * @internal
	 */
	export function createRow<
		const TScope extends string | undefined,
		const TCell extends ImplicitAllowedTypes,
		const TProps extends ImplicitFieldSchema,
	>({
		schemaFactory,
		cell,
		props,
	}: System_TableSchema.CreateRowOptionsBase<TScope, TCell> & {
		/**
		 * Optional row properties.
		 */
		readonly props: TProps;
	}): ReturnType<typeof System_TableSchema.createRowInternal<TScope, TCell, TProps>>;
	/**
	 * Overload implementation
	 */
	export function createRow({
		schemaFactory,
		cell,
		props = SchemaFactory.optional(SchemaFactory.null),
	}: System_TableSchema.CreateRowOptionsBase & {
		readonly props?: ImplicitFieldSchema;
	}): TreeNodeSchema {
		return System_TableSchema.createRowInternal(schemaFactory, cell, props);
	}

	// #endregion

	// #region Table

	/**
	 * A key to uniquely identify a cell in a table.
	 * @internal
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
	 * @internal
	 */
	export interface InsertColumnParameters<
		TColumn extends ImplicitAllowedTypes = ImplicitAllowedTypes,
	> {
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
	 * {@link TableSchema.ITable.insertRows} parameters.
	 * @internal
	 */
	export interface InsertRowsParameters<
		TRow extends ImplicitAllowedTypes = ImplicitAllowedTypes,
	> {
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
	 * {@link TableSchema.ITable.setCell} parameters.
	 * @internal
	 */
	export interface SetCellParameters<
		TColumn extends ImplicitAllowedTypes = ImplicitAllowedTypes,
	> {
		/**
		 * The key to uniquely identify a cell in a table.
		 */
		readonly key: CellKey;

		/**
		 * The cell to set.
		 */
		readonly cell: InsertableTreeNodeFromImplicitAllowedTypes<TColumn>;
	}

	/**
	 * A table.
	 * @sealed @internal
	 */
	export interface ITable<
		TCell extends ImplicitAllowedTypes = ImplicitAllowedTypes,
		TColumn extends ImplicitAllowedTypes = ImplicitAllowedTypes,
		TRow extends ImplicitAllowedTypes = ImplicitAllowedTypes,
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
		 * Gets a table column by its {@link TableSchema.IColumn.id}.
		 */
		getColumn(id: string): TreeNodeFromImplicitAllowedTypes<TColumn> | undefined;

		/**
		 * Gets a table row by its {@link TableSchema.IRow.id}.
		 */
		getRow(id: string): TreeNodeFromImplicitAllowedTypes<TRow> | undefined;

		/**
		 * Gets a cell in the table by column and row IDs.
		 * @param key - A key that uniquely distinguishes a cell in the table, represented as a combination of the column ID and row ID.
		 * @privateRemarks TODO: add overload that takes row and column nodes.
		 */
		getCell(key: CellKey): TreeNodeFromImplicitAllowedTypes<TCell> | undefined;

		/**
		 * Inserts a column into the table.
		 *
		 * @throws
		 * Throws an error if the column is already in the tree, or if the specified index is out of range.
		 * No column is inserted in these cases.
		 */
		insertColumn(
			params: InsertColumnParameters<TColumn>,
		): TreeNodeFromImplicitAllowedTypes<TColumn>;

		/**
		 * Inserts 0 or more rows into the table.
		 *
		 * @throws
		 * Throws an error if any of the rows are already in the tree, or if the specified index is out of range.
		 * No rows are inserted in these cases.
		 */
		insertRows(params: InsertRowsParameters<TRow>): TreeNodeFromImplicitAllowedTypes<TRow>[];

		/**
		 * Sets the cell at the specified location in the table.
		 * @remarks To remove a cell, call {@link TableSchema.ITable.removeCell} instead.
		 * @privateRemarks
		 * TODO:
		 * - Add overload that takes column/row nodes.
		 * - Throw an error if the location is invalid.
		 */
		setCell(params: SetCellParameters<TCell>): void;

		/**
		 * Removes the specified column from the table.
		 * @remarks Note: this does not remove any cells from the table's rows.
		 * @privateRemarks
		 * TODO:
		 * - Add overload that takes an ID.
		 * - Return removed column.
		 * - Throw an error if the column isn't in the table.
		 * - (future) Actually remove corresponding cells from table rows.
		 */
		removeColumn: (column: TreeNodeFromImplicitAllowedTypes<TColumn>) => void;

		/**
		 * Removes 0 or more rows from the table.
		 * @throws Throws an error if any of the rows are not in the table.
		 * In this case, no rows are removed.
		 * @privateRemarks
		 * TODO:
		 * - Add overload that takes an ID.
		 * - Return removed rows.
		 * - Throw an error if any row(s) aren't in the table.
		 */
		removeRows(rows: readonly TreeNodeFromImplicitAllowedTypes<TRow>[]): void;

		/**
		 * Removes all rows from the table.
		 * @privateRemarks TODO: Return removed rows (if any).
		 */
		removeAllRows(): void;

		/**
		 * Removes the cell at the specified location in the table.
		 * @returns The cell if it exists, otherwise undefined.
		 * @throws Throws an error if the location does not exist in the table.
		 * @privateRemarks
		 * TODO:
		 * - Add overload that takes column/row nodes?
		 */
		removeCell(key: CellKey): TreeNodeFromImplicitAllowedTypes<TCell> | undefined;
	}

	/**
	 * Factory for creating new table schema without specifying row or column schema.
	 * @internal
	 */
	export function createTable<
		const TScope extends string | undefined,
		const TCell extends ImplicitAllowedTypes,
	>({
		schemaFactory,
		cell,
	}: System_TableSchema.TableFactoryOptionsBase<TScope, TCell>): ReturnType<
		typeof System_TableSchema.createTableInternal<TScope, TCell>
	>;
	/**
	 * Factory for creating new table schema without specifying row schema.
	 * @internal
	 */
	export function createTable<
		const TScope extends string | undefined,
		const TCell extends ImplicitAllowedTypes,
		const TColumn extends System_TableSchema.ColumnSchemaBase<TScope>,
	>({
		schemaFactory,
		cell,
		column,
	}: System_TableSchema.TableFactoryOptionsBase<TScope, TCell> & {
		readonly column: TColumn;
	}): ReturnType<typeof System_TableSchema.createTableInternal<TScope, TCell, TColumn>>;
	/**
	 * Factory for creating new table schema.
	 * @internal
	 */
	export function createTable<
		const TScope extends string | undefined,
		const TCell extends ImplicitAllowedTypes,
		const TColumn extends System_TableSchema.ColumnSchemaBase<TScope>,
		const TRow extends System_TableSchema.RowSchemaBase<TScope, TCell>,
	>({
		schemaFactory,
		cell,
		column,
		row,
	}: System_TableSchema.TableFactoryOptionsBase<TScope, TCell> & {
		readonly column: TColumn;
		readonly row: TRow;
	}): ReturnType<typeof System_TableSchema.createTableInternal<TScope, TCell, TColumn, TRow>>;
	/**
	 * Overload implementation
	 */
	export function createTable({
		schemaFactory,
		cell,
		column = createColumn({
			schemaFactory,
		}),
		row = createRow({
			schemaFactory,
			cell,
		}),
	}: System_TableSchema.TableFactoryOptionsBase & {
		readonly column?: System_TableSchema.ColumnSchemaBase;
		readonly row?: System_TableSchema.RowSchemaBase;
	}): TreeNodeSchema {
		return System_TableSchema.createTableInternal(schemaFactory, cell, column, row);
	}

	// #endregion
}
