/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { fail } from "@fluidframework/core-utils/internal";
import { UsageError } from "@fluidframework/telemetry-utils/internal";

import { TreeAlpha } from "./shared-tree/index.js";
import {
	type FieldHasDefault,
	type ImplicitAllowedTypes,
	type InsertableObjectFromSchemaRecord,
	type InsertableTreeNodeFromImplicitAllowedTypes,
	type NodeKind,
	SchemaFactoryBeta,
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
	type ImplicitFieldSchema,
	withBufferedTreeEvents,
	type TreeRecordNode,
} from "./simple-tree/index.js";
import { validateIndex, validateIndexRange } from "./util/index.js";

// Future improvement TODOs:
// - Omit `cells` property from Row insertion type.
// - Record-like type parameters / input parameters?
// - Omit `props` properties from Row and Column schemas when not provided?

// Longer-term work:
// - Add constraint APIs to make it possible to avoid situations that could yield "orphaned" cells.

/**
 * Scope for table schema built-in types.
 * @remarks User-provided factory scoping will be applied as `com.fluidframework.table<user-scope>`.
 */
const baseSchemaScope = "com.fluidframework.table";

/**
 * A private symbol put on table schema to help identify them.
 */
const tableSchemaSymbol: unique symbol = Symbol("tableNode");

/**
 * A row in a table.
 * @typeParam TCellSchema - The type of the cells in the {@link TableSchema.Table}.
 * @typeParam TPropsSchema - Additional properties to associate with the row.
 * @privateRemarks Private counterpart to the {@link TableSchema.Row}.
 * Exposes internal properties needed for table operations (publicly exposed via {@link TableSchema.Table}).
 * @sealed
 */
export interface RowPrivate<
	TCellSchema extends ImplicitAllowedTypes,
	TPropsSchema extends ImplicitFieldSchema = ImplicitFieldSchema,
> extends TableSchema.Row<TCellSchema, TPropsSchema> {
	/**
	 * The row's cells.
	 * @remarks This is a user-defined schema that can be used to store additional information about the row.
	 * @privateRemarks
	 * Note: these docs are duplicated on the inline type definitions in {@link System_TableSchema.createRowSchema}.
	 * If you update the docs here, please also update the inline type definitions.
	 */
	readonly cells: TreeRecordNode<TCellSchema>;
}

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
	export interface OptionsWithSchemaFactory<TSchemaFactory extends SchemaFactoryBeta> {
		/**
		 * Schema factory with which the Column schema will be associated.
		 * @remarks Can be used to associate the resulting schema with an existing {@link SchemaFactory.scope|scope}.
		 * The resulting schema will have an identifier of the form: `com.fluidframework.table<${TUserScope}>.<Column|Row|Table>`.
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
	 * Base options for creating table column schema.
	 * @remarks Includes parameters common to all column factory overloads.
	 * @system @alpha
	 */
	export type CreateColumnOptionsBase<
		TUserScope extends string = string,
		TSchemaFactory extends SchemaFactoryBeta<TUserScope> = SchemaFactoryBeta<TUserScope>,
		TCellSchema extends ImplicitAllowedTypes = ImplicitAllowedTypes,
	> = OptionsWithSchemaFactory<TSchemaFactory> & OptionsWithCellSchema<TCellSchema>;

	/**
	 * Factory for creating column schema.
	 * @system @alpha
	 */
	// eslint-disable-next-line @typescript-eslint/explicit-function-return-type -- Return type is too complex to be reasonable to specify
	export function createColumnSchema<
		const TUserScope extends string,
		const TCellSchema extends ImplicitAllowedTypes,
		const TPropsSchema extends ImplicitFieldSchema,
	>(inputSchemaFactory: SchemaFactoryBeta<TUserScope>, propsSchema: TPropsSchema) {
		const schemaFactory = createTableScopedFactory(inputSchemaFactory);
		type Scope = typeof schemaFactory.scope;

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
			extends schemaFactory.object("Column", columnFields, {
				// Will make it easier to evolve this schema in the future.
				allowUnknownOptionalFields: true,
			})
			implements TableSchema.Column<TCellSchema, TPropsSchema> {}

		type ColumnValueType = TreeNode &
			TableSchema.Column<TCellSchema, TPropsSchema> &
			WithType<ScopedSchemaName<Scope, "Column">>;

		// Note: ideally this type would just leverage `InsertableObjectFromSchemaRecord<typeof columnFields>`,
		// but that results in broken `.d.ts` output due to a TypeScript bug.
		// See: https://github.com/microsoft/TypeScript/issues/58688.
		// Instead we extract and inline the typing of the "props" field here, which seems to sufficiently work around the issue.
		// type ColumnInsertableType = InsertableObjectFromSchemaRecord<typeof columnFields>;
		type ColumnInsertableType = InsertableObjectFromSchemaRecord<
			typeof columnFieldsBuiltInParts
		> &
			(FieldHasDefault<TPropsSchema> extends true
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
		TUserScope extends string = string,
		TCellSchema extends ImplicitAllowedTypes = ImplicitAllowedTypes,
		TPropsSchema extends ImplicitFieldSchema = ImplicitFieldSchema,
	> = ReturnType<typeof createColumnSchema<TUserScope, TCellSchema, TPropsSchema>>;

	// #endregion

	// #region Row

	/**
	 * Base options for creating table row schema.
	 * @remarks Includes parameters common to all row factory overloads.
	 * @system @alpha
	 */
	export type CreateRowOptionsBase<
		TUserScope extends string = string,
		TSchemaFactory extends SchemaFactoryBeta<TUserScope> = SchemaFactoryBeta<TUserScope>,
		TCellSchema extends ImplicitAllowedTypes = ImplicitAllowedTypes,
	> = OptionsWithSchemaFactory<TSchemaFactory> & OptionsWithCellSchema<TCellSchema>;

	/**
	 * Factory for creating row schema.
	 * @sealed @alpha
	 */
	// eslint-disable-next-line @typescript-eslint/explicit-function-return-type -- Return type is too complex to be reasonable to specify
	export function createRowSchema<
		const TUserScope extends string,
		const TCellSchema extends ImplicitAllowedTypes,
		const TPropsSchema extends ImplicitFieldSchema,
	>(
		inputSchemaFactory: SchemaFactoryBeta<TUserScope>,
		cellSchema: TCellSchema,
		propsSchema: TPropsSchema,
	) {
		const schemaFactory = createTableScopedFactory(inputSchemaFactory);
		type Scope = typeof schemaFactory.scope;

		// Note: `rowFields` is broken into two parts to work around a TypeScript bug
		// that results in broken `.d.ts` output.
		// See definition of `RowInsertableType` below.
		const rowFieldsBuiltInParts = {
			id: schemaFactory.identifier,
			/**
			 * The cells of the table row, keyed by column ID.
			 * @remarks
			 * The table row models its cells as a record, where each key is the ID of the column it belongs to. The choice of record (as opposed to a map) is intended to make interop with common table rendering libraries in TypeScript/JavaScript easier.
			 */
			cells: schemaFactory.required(schemaFactory.record("Row.cells", cellSchema), {
				metadata: {
					description: "The cells of the table row, keyed by column ID.",
				},
			}),
		} as const;
		const rowFieldsPropsPart = {
			props: propsSchema,
		} as const;

		/**
		 * {@link RowSchema} fields.
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
		class RowSchema
			extends schemaFactory.object("Row", rowFields, {
				// Will make it easier to evolve this schema in the future.
				allowUnknownOptionalFields: true,
			})
			implements RowPrivate<TCellSchema, TPropsSchema> {}

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

		// Modified version of `Row` that ensures the constructor (and `createFromInsertable`) are
		// typed correctly in terms of our insertable type.
		// This lets us be selective in our type-cast for the value returned from this function,
		// preserving as much type-safety as we reasonably can.
		type RowSchemaModifiedType = Omit<
			// Use mapped type to omit the constructor
			{
				[Property in keyof typeof RowSchema]: (typeof RowSchema)[Property];
			},
			"createFromInsertable"
		> &
			(new (
				parameters: InternalTreeNode | RowInsertableType,
			) => RowSchema) & {
				createFromInsertable(parameters: RowInsertableType): RowSchema;
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
		> = RowSchema as RowSchemaModifiedType;

		return RowSchemaType;
	}

	/**
	 * Base row schema type.
	 * @sealed @system @alpha
	 */
	export type RowSchemaBase<
		TUserScope extends string = string,
		TCellSchema extends ImplicitAllowedTypes = ImplicitAllowedTypes,
		TPropsSchema extends ImplicitFieldSchema = ImplicitFieldSchema,
	> = ReturnType<typeof createRowSchema<TUserScope, TCellSchema, TPropsSchema>>;

	// #endregion

	// #region Table

	/**
	 * Base options for creating table schema.
	 * @remarks Includes parameters common to all table factory overloads.
	 * @system @alpha
	 */
	export type TableFactoryOptionsBase<
		TUserScope extends string = string,
		TSchemaFactory extends SchemaFactoryBeta<TUserScope> = SchemaFactoryBeta<TUserScope>,
		TCellSchema extends ImplicitAllowedTypes = ImplicitAllowedTypes,
	> = OptionsWithSchemaFactory<TSchemaFactory> & OptionsWithCellSchema<TCellSchema>;

	/**
	 * Factory for creating table schema.
	 * @system @alpha
	 */
	// eslint-disable-next-line @typescript-eslint/explicit-function-return-type -- Return type is too complex to be reasonable to specify
	export function createTableSchema<
		const TUserScope extends string,
		const TCellSchema extends ImplicitAllowedTypes,
		const TColumnSchema extends ColumnSchemaBase<TUserScope, TCellSchema>,
		const TRowSchema extends RowSchemaBase<TUserScope, TCellSchema>,
	>(
		inputSchemaFactory: SchemaFactoryBeta<TUserScope>,
		_cellSchema: TCellSchema,
		columnSchema: TColumnSchema,
		rowSchema: TRowSchema,
	) {
		const schemaFactory = createTableScopedFactory(inputSchemaFactory);
		type Scope = typeof schemaFactory.scope;

		type CellValueType = TreeNodeFromImplicitAllowedTypes<TCellSchema>;
		type ColumnValueType = TreeNodeFromImplicitAllowedTypes<TColumnSchema>;
		type RowValueType = TreeNodeFromImplicitAllowedTypes<TRowSchema>;

		// Internal version of RowValueType that exposes the `cells` property for use within Table methods.
		type RowValueInternalType = RowValueType & RowPrivate<TCellSchema>;

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
			extends schemaFactory.object("Table", tableFields, {
				// Will make it easier to evolve this schema in the future.
				allowUnknownOptionalFields: true,
			})
			implements TableSchema.Table<TUserScope, TCellSchema, TColumnSchema, TRowSchema>
		{
			public static empty<TThis extends TableConstructorType>(
				this: TThis,
			): InstanceType<TThis> {
				return new this({ columns: [], rows: [] }) as InstanceType<TThis>;
			}

			public getColumn(indexOrId: number | string): ColumnValueType | undefined {
				return this.#tryGetColumn(indexOrId);
			}

			public getRow(indexOrId: number | string): RowValueType | undefined {
				return this.#tryGetRow(indexOrId);
			}

			public getCell(
				key: TableSchema.CellKey<TColumnSchema, TRowSchema>,
			): CellValueType | undefined {
				const { column: columnOrIdOrIndex, row: rowOrIdOrIndex } = key;
				const row = this.#tryGetRow(rowOrIdOrIndex);
				if (row === undefined) {
					return undefined;
				}

				const column = this.#tryGetColumn(columnOrIdOrIndex);
				if (column === undefined) {
					return undefined;
				}

				return (row as RowValueInternalType).cells[column.id];
			}

			public insertColumns({
				columns,
				index,
			}: TableSchema.InsertColumnsParameters<TColumnSchema>): ColumnValueType[] {
				// TypeScript is unable to narrow the column type correctly here, hence the casts below.
				// See: https://github.com/microsoft/TypeScript/issues/52144
				if (index === undefined) {
					// eslint-disable-next-line @typescript-eslint/no-explicit-any
					this.columns.insertAtEnd(TreeArrayNode.spread(columns) as any);
				} else {
					// Ensure specified index is valid
					validateIndex(index, this.columns, "Table.insertColumns", true);

					// eslint-disable-next-line @typescript-eslint/no-explicit-any
					this.columns.insertAt(index, TreeArrayNode.spread(columns) as any);
				}

				// Inserting the input nodes into the tree hydrates them, making them usable as nodes.
				return columns as unknown as ColumnValueType[];
			}

			public insertRows({
				index,
				rows,
			}: TableSchema.InsertRowsParameters<TRowSchema>): RowValueType[] {
				// #region Input validation

				// Ensure specified index is valid
				if (index !== undefined) {
					validateIndex(index, this.rows, "Table.insertRows", true);
				}

				// Note: TypeScript is unable to narrow the type of the row type correctly here, hence the casts below.
				// See: https://github.com/microsoft/TypeScript/issues/52144
				for (const newRow of rows) {
					// If the row contains cells, verify that the table contains the columns for those cells.
					// Note: we intentionally hide `cells` on `IRow` to avoid leaking the internal data representation as much as possible, so we have to cast here.
					// eslint-disable-next-line @typescript-eslint/no-explicit-any
					if ((newRow as any).cells !== undefined) {
						// eslint-disable-next-line @typescript-eslint/no-explicit-any
						const keys: string[] = Object.keys((newRow as any).cells);
						for (const key of keys) {
							if (!this.#containsColumnWithId(key)) {
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

				const row = this.#getRow(rowOrId);
				const column = this.#getColumn(columnOrId);

				(row as RowValueInternalType).cells[column.id] = cell as CellValueType;
			}

			public removeColumns(
				indexOrColumns: number | undefined | readonly string[] | readonly ColumnValueType[],
				count: number | undefined = undefined,
			): ColumnValueType[] {
				if (typeof indexOrColumns === "number" || indexOrColumns === undefined) {
					let removedColumns: ColumnValueType[] | undefined;
					const startIndex = indexOrColumns ?? 0;
					const endIndex = count === undefined ? this.columns.length : startIndex + count;

					// If there are no columns to remove, do nothing
					if (startIndex === endIndex) {
						return [];
					}

					validateIndexRange(startIndex, endIndex, this.columns, "Table.removeColumns");

					this.#applyEditsInBatch(() => {
						const columnsToRemove = this.columns.slice(
							startIndex,
							endIndex,
						) as ColumnValueType[];

						// First, remove all cells that correspond to each column from each row:
						for (const column of columnsToRemove) {
							this.#removeCells(column);
						}

						// Second, remove the column nodes:
						removeRangeFromArray(startIndex, endIndex, this.columns, "Table.removeColumns");
						removedColumns = columnsToRemove;
					});
					return removedColumns ?? fail(0xc1f /* Transaction did not complete. */);
				} else {
					// If there are no columns to remove, do nothing
					if (indexOrColumns.length === 0) {
						return [];
					}

					// Resolve any IDs to actual nodes.
					// This validates that all of the rows exist before starting transaction.
					// This improves user-facing error experience.
					const columnsToRemove: ColumnValueType[] = [];
					for (const columnOrIdToRemove of indexOrColumns) {
						columnsToRemove.push(this.#getColumn(columnOrIdToRemove));
					}

					this.#applyEditsInBatch(() => {
						// Note, throwing an error within a transaction will abort the entire transaction.
						// So if we throw an error here for any column, no columns will be removed.
						for (const columnToRemove of columnsToRemove) {
							// Remove the corresponding cell from all rows.
							for (const row of this.rows) {
								// TypeScript is unable to narrow the row type correctly here, hence the cast.
								// See: https://github.com/microsoft/TypeScript/issues/52144
								this.removeCell({
									column: columnToRemove,
									row: row as RowValueType,
								});
							}

							// We have already validated that all of the columns exist above, so this is safe.
							this.columns.removeAt(this.columns.indexOf(columnToRemove));
						}
					});
					return columnsToRemove;
				}
			}

			public removeRows(
				indexOrRows: number | undefined | readonly string[] | readonly RowValueType[],
				count?: number | undefined,
			): RowValueType[] {
				if (typeof indexOrRows === "number" || indexOrRows === undefined) {
					const startIndex = indexOrRows ?? 0;
					const endIndex = count === undefined ? this.columns.length : startIndex + count;

					// If there are no rows to remove, do nothing
					if (startIndex === endIndex) {
						return [];
					}

					return removeRangeFromArray(startIndex, endIndex, this.rows, "Table.removeRows");
				}

				// If there are no rows to remove, do nothing
				if (indexOrRows.length === 0) {
					return [];
				}

				// Resolve any IDs to actual nodes.
				// This validates that all of the rows exist before starting transaction.
				// This improves user-facing error experience.
				const rowsToRemove: RowValueType[] = [];
				for (const rowToRemove of indexOrRows) {
					rowsToRemove.push(this.#getRow(rowToRemove));
				}

				this.#applyEditsInBatch(() => {
					// Note, throwing an error within a transaction will abort the entire transaction.
					// So if we throw an error here for any row, no rows will be removed.
					for (const rowToRemove of rowsToRemove) {
						// We have already validated that all of the rows exist above, so this is safe.
						const index = this.rows.indexOf(rowToRemove);
						this.rows.removeAt(index);
					}
				});
				return rowsToRemove;
			}

			public removeCell(
				key: TableSchema.CellKey<TColumnSchema, TRowSchema>,
			): CellValueType | undefined {
				const { column: columnOrIdOrIndex, row: rowOrIdOrIndex } = key;
				const row = this.#getRow(rowOrIdOrIndex) as RowValueInternalType;
				const column = this.#getColumn(columnOrIdOrIndex);

				const cell: CellValueType | undefined = row.cells[column.id];
				if (cell === undefined) {
					return undefined;
				}

				// eslint-disable-next-line @typescript-eslint/no-dynamic-delete
				delete row.cells[column.id];
				return cell;
			}

			/**
			 * Removes the cell corresponding with the specified column from each row in the table.
			 */
			#removeCells(column: ColumnValueType): void {
				for (const row of this.rows) {
					// TypeScript is unable to narrow the row type correctly here, hence the cast.
					// See: https://github.com/microsoft/TypeScript/issues/52144
					this.removeCell({
						column,
						row: row as RowValueType,
					});
				}
			}

			/**
			 * Applies the provided edits in a "batch".
			 *
			 * @remarks
			 * For hydrated trees, this will be done in a transaction to ensure atomicity.
			 *
			 * Transactions are not supported for unhydrated trees, so we cannot run a transaction in that case.
			 * But since there are no collaborators, this is not an issue.
			 */
			#applyEditsInBatch(applyEdits: () => void): void {
				const branch = TreeAlpha.branch(this);

				// Ensure events are paused until all of the edits are applied.
				// This ensures that the user sees the corresponding table-level edit as atomic,
				// and ensures they are not spammed with intermediate events.
				withBufferedTreeEvents(() => {
					if (branch === undefined) {
						// If this node does not have a corresponding branch, then it is unhydrated.
						// I.e., it is not part of a collaborative session yet.
						// Therefore, we don't need to run the edits as a transaction.
						applyEdits();
					} else {
						branch.runTransaction(() => {
							applyEdits();
						});
					}
				});
			}

			/**
			 * Attempts to resolve the provided Column node or ID to a Column node in the table.
			 * Returns `undefined` if there is no match.
			 * @remarks Searches for a match based strictly on the ID and returns that result.
			 */
			#tryGetColumn(
				columnOrIdOrIndex: ColumnValueType | string | number,
			): ColumnValueType | undefined {
				if (typeof columnOrIdOrIndex === "number") {
					if (columnOrIdOrIndex < 0 || columnOrIdOrIndex >= this.columns.length) {
						return undefined;
					}
					// TypeScript is unable to narrow the types correctly here, hence the cast.
					// See: https://github.com/microsoft/TypeScript/issues/52144
					return this.columns[columnOrIdOrIndex] as ColumnValueType;
				}

				if (typeof columnOrIdOrIndex === "string") {
					const columnId = columnOrIdOrIndex;
					// TypeScript is unable to narrow the types correctly here, hence the casts.
					// See: https://github.com/microsoft/TypeScript/issues/52144
					return this.columns.find((col) => (col as ColumnValueType).id === columnId) as
						| ColumnValueType
						| undefined;
				}

				// If the user provided a node, ensure it actually exists in this table.
				if (!this.columns.includes(columnOrIdOrIndex)) {
					return undefined;
				}

				return columnOrIdOrIndex;
			}

			/**
			 * Attempts to resolve the provided Column node or ID to a Column node in the table.
			 * @throws Throws a `UsageError` if there is no match.
			 * @remarks Searches for a match based strictly on the ID and returns that result.
			 */
			#getColumn(columnOrIdOrIndex: ColumnValueType | string | number): ColumnValueType {
				const column = this.#tryGetColumn(columnOrIdOrIndex);
				if (column === undefined) {
					Table._throwMissingColumnError(columnOrIdOrIndex);
				}
				return column;
			}

			/**
			 * Checks if a Column with the specified ID exists in the table.
			 */
			#containsColumnWithId(columnId: string): boolean {
				return this.#tryGetColumn(columnId) !== undefined;
			}

			/**
			 * Throw a `UsageError` for a missing Column by its ID or index.
			 */
			private static _throwMissingColumnError(
				columnOrIdOrIndex: ColumnValueType | string | number,
			): never {
				if (typeof columnOrIdOrIndex === "number") {
					throw new UsageError(`No column exists at index ${columnOrIdOrIndex}.`);
				}

				if (typeof columnOrIdOrIndex === "string") {
					throw new UsageError(
						`No column with ID "${columnOrIdOrIndex}" exists in the table.`,
					);
				}

				throw new UsageError(
					`The specified column node with ID "${columnOrIdOrIndex.id}" does not exist in the table.`,
				);
			}

			/**
			 * Attempts to resolve the provided Row node or ID to a Row node in the table.
			 * Returns `undefined` if there is no match.
			 * @remarks Searches for a match based strictly on the ID and returns that result.
			 */
			#tryGetRow(rowOrIdOrIndex: RowValueType | string | number): RowValueType | undefined {
				if (typeof rowOrIdOrIndex === "number") {
					if (rowOrIdOrIndex < 0 || rowOrIdOrIndex >= this.rows.length) {
						return undefined;
					}
					// TypeScript is unable to narrow the types correctly here, hence the cast.
					// See: https://github.com/microsoft/TypeScript/issues/52144
					return this.rows[rowOrIdOrIndex] as RowValueType;
				}

				if (typeof rowOrIdOrIndex === "string") {
					const rowId = rowOrIdOrIndex;
					// TypeScript is unable to narrow the types correctly here, hence the casts.
					// See: https://github.com/microsoft/TypeScript/issues/52144
					return this.rows.find((row) => (row as RowValueType).id === rowId) as
						| RowValueType
						| undefined;
				}

				// If the user provided a node, ensure it actually exists in this table.
				if (!this.rows.includes(rowOrIdOrIndex)) {
					return undefined;
				}

				return rowOrIdOrIndex;
			}

			/**
			 * Attempts to resolve the provided Row node, ID, or index to a Row node in the table.
			 * @throws Throws a `UsageError` if there is no match.
			 * @remarks Searches for a match based strictly on the ID and returns that result.
			 */
			#getRow(rowOrIdOrIndex: RowValueType | string | number): RowValueType {
				const row = this.#tryGetRow(rowOrIdOrIndex);
				if (row === undefined) {
					Table._throwMissingRowError(rowOrIdOrIndex);
				}
				return row;
			}

			/**
			 * Throw a `UsageError` for a missing Row by its ID or index.
			 */
			private static _throwMissingRowError(
				rowOrIdOrIndex: RowValueType | string | number,
			): never {
				if (typeof rowOrIdOrIndex === "number") {
					throw new UsageError(`No row exists at index ${rowOrIdOrIndex}.`);
				}

				if (typeof rowOrIdOrIndex === "string") {
					throw new UsageError(`No row with ID "${rowOrIdOrIndex}" exists in the table.`);
				}

				throw new UsageError(
					`The specified row node with ID "${rowOrIdOrIndex.id}" does not exist in the table.`,
				);
			}
		}

		// Set a private symbol on the schema class that marks it as having been generated by this factory.
		// Column / Row functionality use this to validate that they are being used in a table.
		// This is effectively a work-around that allows columns and rows to invoke table methods
		// without having to pass the table as a parameter to their construction, which isn't possible.
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		(Table as any)[tableSchemaSymbol] = true;

		type TableValueType = TreeNode &
			TableSchema.Table<TUserScope, TCellSchema, TColumnSchema, TRowSchema> &
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
		TUserScope extends string,
		TCellSchema extends ImplicitAllowedTypes,
		TColumnSchema extends ColumnSchemaBase<TUserScope, TCellSchema>,
		TRowSchema extends RowSchemaBase<TUserScope, TCellSchema>,
	> = ReturnType<typeof createTableSchema<TUserScope, TCellSchema, TColumnSchema, TRowSchema>>;

	// #endregion
}

function createTableScopedFactory<TUserScope extends string>(
	inputSchemaFactory: SchemaFactoryBeta<TUserScope>,
): SchemaFactoryBeta<`${typeof baseSchemaScope}<${TUserScope}>`> {
	return new SchemaFactoryBeta(`${baseSchemaScope}<${inputSchemaFactory.scope}>`);
}

/**
 * Removes the specified range of elements from the array.
 * @returns The removed elements.
 */
function removeRangeFromArray<TNodeSchema extends ImplicitAllowedTypes>(
	startIndex: number,
	endIndex: number,
	array: TreeArrayNode<TNodeSchema>,
	methodName: string,
): TreeNodeFromImplicitAllowedTypes<TNodeSchema>[] {
	validateIndexRange(startIndex, endIndex, array, methodName);

	// TypeScript is unable to narrow the array element type correctly here, hence the cast.
	// See: https://github.com/microsoft/TypeScript/issues/52144
	const removedRows = array.slice(
		startIndex,
		endIndex,
	) as TreeNodeFromImplicitAllowedTypes<TNodeSchema>[];
	array.removeRange(startIndex, endIndex);

	return removedRows;
}

/**
 * Contains types and factories for creating schema to represent dynamic tabular data.
 *
 * @remarks
 *
 * WARNING: These APIs are in preview and are subject to change.
 * Until these APIs have stabilized, it is not recommended to use them in production code.
 * There may be breaking changes to these APIs and their underlying data format.
 * Using these APIs in production code may result in data loss or corruption.
 *
 * The primary APIs for create tabular data schema are:
 *
 * - {@link TableSchema.(table:1)}
 *
 * - {@link TableSchema.(column:1)}
 *
 * - {@link TableSchema.(row:1)}
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
 * Cells in the table may become "orphaned."
 * That is, it is possible to enter a state where one or more rows contain cells with no corresponding column.
 * To reduce the likelihood of this, you can manually remove corresponding cells when removing columns.
 * Either way, it is possible to enter such a state via the merging of edits.
 * For example: one client might add a row while another concurrently removes a column, orphaning the cell where the column and row intersected.
 *
 * @example Defining a Table schema
 *
 * ```typescript
 * class MyTable extends TableSchema.table({
 * 	schemaFactory,
 * 	cell: schemaFactory.string,
 * }) {}
 *
 * const table = new MyTable({
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
 * class MyColumn extends TableSchema.column({
 * 	schemaFactory,
 * 	cell: Cell,
 * 	props: schemaFactory.object("TableColumnProps", {
 * 		label: schemaFactory.string,
 * 	}),
 * }) {}
 *
 * class MyRow extends TableSchema.row({
 * 	schemaFactory,
 * 	cell: Cell,
 * }) {}
 *
 * class MyTable extends TableSchema.table({
 * 	schemaFactory,
 * 	cell: Cell,
 * 	column: MyColumn,
 * 	row: MyRow,
 * }) {}
 *
 * const table = new MyTable({
 * 	columns: [
 * 		new MyColumn({ props: { label: "Entry" } }),
 * 		new MyColumn({ props: { label: "Date" } }),
 * 		new MyColumn({ props: { label: "Amount" } }),
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
	 * @typeParam TCell - The type of the cells in the {@link TableSchema.Table}.
	 * @typeParam TProps - Additional properties to associate with the column.
	 * @sealed @alpha
	 */
	export interface Column<
		// eslint-disable-next-line @typescript-eslint/no-unused-vars -- Reserving this for future use.
		TCell extends ImplicitAllowedTypes,
		TProps extends ImplicitFieldSchema = ImplicitFieldSchema,
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
		get props(): TreeFieldFromImplicitField<TProps>;
		set props(value: InsertableTreeFieldFromImplicitField<TProps>);
	}

	/**
	 * Factory for creating new table column schema.
	 * @typeParam TUserScope - The {@link SchemaFactory.scope | schema factory scope}.
	 * @typeParam TCell - The type of the cells in the {@link TableSchema.Table}.
	 * @alpha
	 */
	export function column<
		const TUserScope extends string,
		const TCell extends ImplicitAllowedTypes,
	>(
		params: System_TableSchema.CreateColumnOptionsBase<
			TUserScope,
			SchemaFactoryBeta<TUserScope>,
			TCell
		>,
	): System_TableSchema.ColumnSchemaBase<
		TUserScope,
		TCell,
		System_TableSchema.DefaultPropsType
	>;
	/**
	 * Factory for creating new table column schema.
	 * @typeParam TUserScope - The {@link SchemaFactory.scope | schema factory scope}.
	 * @typeParam TCell - The type of the cells in the {@link TableSchema.Table}.
	 * @typeParam TProps - Additional properties to associate with the column.
	 * @alpha
	 */
	export function column<
		const TUserScope extends string,
		const TCell extends ImplicitAllowedTypes,
		const TProps extends ImplicitFieldSchema,
	>(
		params: System_TableSchema.CreateColumnOptionsBase<
			TUserScope,
			SchemaFactoryBeta<TUserScope>,
			TCell
		> & {
			/**
			 * Optional column properties.
			 */
			readonly props: TProps;
		},
	): System_TableSchema.ColumnSchemaBase<TUserScope, TCell, TProps>;
	/**
	 * Overload implementation
	 */
	export function column({
		schemaFactory,
		cell,
		props = SchemaFactory.optional(SchemaFactory.null),
	}: System_TableSchema.CreateColumnOptionsBase & {
		readonly props?: ImplicitFieldSchema;
	}): TreeNodeSchema {
		return System_TableSchema.createColumnSchema(schemaFactory, props);
	}

	// #endregion

	// #region Row

	/**
	 * A row in a table.
	 * @remarks Implemented by the schema class returned from {@link TableSchema.(row:2)}.
	 * @typeParam TCell - The type of the cells in the {@link TableSchema.Table}.
	 * @typeParam TProps - Additional properties to associate with the row.
	 * @sealed @alpha
	 */
	export interface Row<
		// eslint-disable-next-line @typescript-eslint/no-unused-vars -- Reserving this for future use.
		TCell extends ImplicitAllowedTypes,
		TProps extends ImplicitFieldSchema = ImplicitFieldSchema,
	> {
		/**
		 * The unique identifier of the row.
		 * @remarks Uniquely identifies the node within the entire tree, not just the table.
		 */
		readonly id: string;

		/**
		 * The row's properties.
		 * @remarks This is a user-defined schema that can be used to store additional information about the row.
		 * @privateRemarks
		 * Note: these docs are duplicated on the inline type definitions in {@link System_TableSchema.createRowSchema}.
		 * If you update the docs here, please also update the inline type definitions.
		 */
		get props(): TreeFieldFromImplicitField<TProps>;
		set props(value: InsertableTreeFieldFromImplicitField<TProps>);
	}

	/**
	 * Factory for creating new table column schema.
	 * @typeParam TUserScope - The {@link SchemaFactory.scope | schema factory scope}.
	 * @typeParam TCell - The type of the cells in the {@link TableSchema.Table}.
	 * @alpha
	 */
	export function row<
		const TUserScope extends string,
		const TCell extends ImplicitAllowedTypes,
	>(
		params: System_TableSchema.CreateRowOptionsBase<
			TUserScope,
			SchemaFactoryBeta<TUserScope>,
			TCell
		>,
	): System_TableSchema.RowSchemaBase<TUserScope, TCell, System_TableSchema.DefaultPropsType>;
	/**
	 * Factory for creating new table row schema.
	 * @typeParam TUserScope - The {@link SchemaFactory.scope | schema factory scope}.
	 * @typeParam TCell - The type of the cells in the {@link TableSchema.Table}.
	 * @typeParam TProps - Additional properties to associate with the row.
	 * @alpha
	 */
	export function row<
		const TUserScope extends string,
		const TCell extends ImplicitAllowedTypes,
		const TProps extends ImplicitFieldSchema,
	>(
		params: System_TableSchema.CreateRowOptionsBase<
			TUserScope,
			SchemaFactoryBeta<TUserScope>,
			TCell
		> & {
			/**
			 * Optional row properties.
			 */
			readonly props: TProps;
		},
	): System_TableSchema.RowSchemaBase<TUserScope, TCell, TProps>;
	/**
	 * Overload implementation
	 */
	export function row({
		schemaFactory,
		cell,
		props = SchemaFactory.optional(SchemaFactory.null),
	}: System_TableSchema.CreateRowOptionsBase & {
		readonly props?: ImplicitFieldSchema;
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
		 * {@link TableSchema.Column}, {@link TableSchema.Column.id}, or column index at which the cell is located.
		 */
		readonly column: string | number | TreeNodeFromImplicitAllowedTypes<TColumn>;

		/**
		 * {@link TableSchema.Row}, {@link TableSchema.Row.id}, or row index at which the cell is located.
		 */
		readonly row: string | number | TreeNodeFromImplicitAllowedTypes<TRow>;
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
	 * @typeParam TUserScope - The {@link SchemaFactory.scope | schema factory scope}.
	 * @typeParam TCell - The type of the cells in the table.
	 * @typeParam TColumn - The type of the columns in the table.
	 * @typeParam TRow - The type of the rows in the table.
	 * @sealed @alpha
	 */
	export interface Table<
		TUserScope extends string,
		TCell extends ImplicitAllowedTypes,
		TColumn extends System_TableSchema.ColumnSchemaBase<TUserScope, TCell>,
		TRow extends System_TableSchema.RowSchemaBase<TUserScope, TCell>,
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
		 * @returns The column, if it exists. Otherwise, `undefined`.
		 */
		getColumn(id: string): TreeNodeFromImplicitAllowedTypes<TColumn> | undefined;
		/**
		 * Gets a table column by its index in the table.
		 * @returns The column, if it exists. Otherwise, `undefined`.
		 */
		getColumn(index: number): TreeNodeFromImplicitAllowedTypes<TColumn> | undefined;

		/**
		 * Gets a table row by its {@link TableSchema.Row.id}.
		 * @returns The row, if it exists. Otherwise, `undefined`.
		 */
		getRow(id: string): TreeNodeFromImplicitAllowedTypes<TRow> | undefined;
		/**
		 * Gets a table row by its index in the table.
		 * @returns The row, if it exists. Otherwise, `undefined`.
		 */
		getRow(index: number): TreeNodeFromImplicitAllowedTypes<TRow> | undefined;

		/**
		 * Gets a cell in the table by corresponding column and row.
		 * @param key - A key that uniquely distinguishes a cell in the table, represented as a combination of the column ID and row ID.
		 * @returns The cell, if it exists. Otherwise, `undefined`.
		 */
		getCell(key: CellKey<TColumn, TRow>): TreeNodeFromImplicitAllowedTypes<TCell> | undefined;

		/**
		 * Inserts 0 or more columns into the table.
		 *
		 * @throws Throws an error if the specified index is out of range.
		 *
		 * No columns are inserted in this case.
		 */
		insertColumns(
			params: InsertColumnsParameters<TColumn>,
		): TreeNodeFromImplicitAllowedTypes<TColumn>[];

		/**
		 * Inserts 0 or more rows into the table.
		 *
		 * @throws
		 * Throws an error in the following cases:
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
		 * Removes a range of columns from the table.
		 *
		 * @remarks
		 * Also removes any corresponding cells from the table's rows.
		 *
		 * Note: this operation can be slow for tables with many rows.
		 * We are actively working on improving the performance of this operation, but for now it may have a negative
		 * impact on performance.
		 * @param index - The starting index of the range to remove. Default: `0`.
		 * @param count - The number of columns to remove. Default: all remaining columns starting from `index`.
		 * @throws Throws an error if the specified range is invalid. In this case, no columns are removed.
		 */
		removeColumns(
			index?: number | undefined,
			count?: number | undefined,
		): TreeNodeFromImplicitAllowedTypes<TColumn>[];
		/**
		 * Removes 0 or more columns from the table.
		 * @remarks
		 * Also removes any corresponding cells from the table's rows.
		 *
		 * Note: this operation can be slow for tables with many rows.
		 * We are actively working on improving the performance of this operation, but for now it may have a negative
		 * impact on performance.
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
		 * Also removes any corresponding cells from the table's rows.
		 *
		 * Note: this operation can be slow for tables with many rows.
		 * We are actively working on improving the performance of this operation, but for now it may have a negative
		 * impact on performance.
		 *
		 * @param columns - The columns to remove, specified by their {@link TableSchema.Column.id}.
		 * @throws Throws an error if any of the columns are not in the table.
		 * In this case, no columns are removed.
		 */
		removeColumns(columns: readonly string[]): TreeNodeFromImplicitAllowedTypes<TColumn>[];

		/**
		 * Removes a range of rows from the table.
		 * @param index - The starting index of the range to remove. Default: `0`.
		 * @param count - The number of rows to remove. Default: all remaining rows starting from `index`.
		 * @throws Throws an error if the specified range is invalid. In this case, no rows are removed.
		 */
		removeRows(
			index?: number | undefined,
			count?: number | undefined,
		): TreeNodeFromImplicitAllowedTypes<TRow>[];
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
	 * @typeParam TUserScope - The {@link SchemaFactory.scope | schema factory scope}.
	 * The resulting schema will have an identifier of the form: `com.fluidframework.table<${TUserScope}>.Table`.
	 * @typeParam TCell - The type of the cells in the table.
	 * @alpha
	 */
	export function table<
		const TUserScope extends string,
		const TCell extends ImplicitAllowedTypes,
	>(
		params: System_TableSchema.TableFactoryOptionsBase<
			TUserScope,
			SchemaFactoryBeta<TUserScope>,
			TCell
		>,
	): System_TableSchema.TableSchemaBase<
		TUserScope,
		TCell,
		System_TableSchema.ColumnSchemaBase<
			TUserScope,
			TCell,
			System_TableSchema.DefaultPropsType
		>,
		System_TableSchema.RowSchemaBase<TUserScope, TCell, System_TableSchema.DefaultPropsType>
	>;
	/**
	 * Factory for creating new table schema with custom column schema.
	 * @typeParam TUserScope - The {@link SchemaFactory.scope | schema factory scope}.
	 * The resulting schema will have an identifier of the form: `com.fluidframework.table<${TUserScope}>.Table`.
	 * @typeParam TCell - The type of the cells in the table.
	 * @typeParam TColumn - The type of the columns in the table.
	 * @alpha
	 */
	export function table<
		const TUserScope extends string,
		const TCell extends ImplicitAllowedTypes,
		const TColumn extends System_TableSchema.ColumnSchemaBase<TUserScope, TCell>,
	>(
		params: System_TableSchema.TableFactoryOptionsBase<
			TUserScope,
			SchemaFactoryBeta<TUserScope>,
			TCell
		> & {
			readonly column: TColumn;
		},
	): System_TableSchema.TableSchemaBase<
		TUserScope,
		TCell,
		TColumn,
		System_TableSchema.RowSchemaBase<TUserScope, TCell, System_TableSchema.DefaultPropsType>
	>;
	/**
	 * Factory for creating new table schema with custom row schema.
	 * @typeParam TUserScope - The {@link SchemaFactory.scope | schema factory scope}.
	 * The resulting schema will have an identifier of the form: `com.fluidframework.table<${TUserScope}>.Table`.
	 * @typeParam TCell - The type of the cells in the table.
	 * @typeParam TRow - The type of the rows in the table.
	 * @alpha
	 */
	export function table<
		const TUserScope extends string,
		const TCell extends ImplicitAllowedTypes,
		const TRow extends System_TableSchema.RowSchemaBase<TUserScope, TCell>,
	>(
		params: System_TableSchema.TableFactoryOptionsBase<
			TUserScope,
			SchemaFactoryBeta<TUserScope>,
			TCell
		> & {
			readonly row: TRow;
		},
	): System_TableSchema.TableSchemaBase<
		TUserScope,
		TCell,
		System_TableSchema.ColumnSchemaBase<
			TUserScope,
			TCell,
			System_TableSchema.DefaultPropsType
		>,
		TRow
	>;
	/**
	 * Factory for creating new table schema with custom column and row schema.
	 * @typeParam TUserScope - The {@link SchemaFactory.scope | schema factory scope}.
	 * The resulting schema will have an identifier of the form: `com.fluidframework.table<${TUserScope}>.Table`.
	 * @typeParam TCell - The type of the cells in the table.
	 * @typeParam TColumn - The type of the columns in the table.
	 * @typeParam TRow - The type of the rows in the table.
	 * @alpha
	 */
	export function table<
		const TUserScope extends string,
		const TCell extends ImplicitAllowedTypes,
		const TColumn extends System_TableSchema.ColumnSchemaBase<TUserScope, TCell>,
		const TRow extends System_TableSchema.RowSchemaBase<TUserScope, TCell>,
	>(
		params: System_TableSchema.TableFactoryOptionsBase<
			TUserScope,
			SchemaFactoryBeta<TUserScope>,
			TCell
		> & {
			readonly column: TColumn;
			readonly row: TRow;
		},
	): System_TableSchema.TableSchemaBase<TUserScope, TCell, TColumn, TRow>;
	/**
	 * Overload implementation
	 */
	export function table({
		schemaFactory,
		cell: cellSchema,
		column: columnSchema = column({
			schemaFactory,
			cell: cellSchema,
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
