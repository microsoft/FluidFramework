/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert, fail } from "node:assert";

import { validateUsageError } from "@fluidframework/test-runtime-utils/internal";

import {
	asAlpha,
	configuredSharedTree,
	FluidClientVersion,
	FormatValidatorBasic,
} from "../index.js";
import { Tree, TreeAlpha } from "../shared-tree/index.js";
import {
	allowUnused,
	getJsonSchema,
	KeyEncodingOptions,
	SchemaFactoryAlpha,
	SchemaFactoryBeta,
	TreeBeta,
	TreeViewConfiguration,
	type ConciseTree,
	type TreeNode,
} from "../simple-tree/index.js";
import { TableSchema } from "../tableSchema.js";
import type {
	areSafelyAssignable,
	JsonCompatibleReadOnly,
	requireFalse,
	requireTrue,
} from "../util/index.js";

// eslint-disable-next-line import-x/no-internal-modules
import { describeHydration } from "./simple-tree/utils.js";
import {
	takeJsonSnapshot,
	testSchemaCompatibilitySnapshots,
	useSnapshotDirectory,
} from "./snapshots/index.js";
import { createTestUndoRedoStacks, TestTreeProviderLite } from "./utils.js";

const schemaFactory = new SchemaFactoryAlpha("test");

class Cell extends schemaFactory.object("table-cell", {
	value: schemaFactory.string,
}) {}

class ColumnProps extends schemaFactory.object("table-column-props", {
	/**
	 * Label text for the column.
	 */
	label: schemaFactory.optional(schemaFactory.string),
}) {}
class Column extends TableSchema.column({
	schemaFactory,
	cell: Cell,
	props: ColumnProps,
}) {}

class RowProps extends schemaFactory.object("table-row-props", {
	/**
	 * Whether or not the row is selectable.
	 * @defaultValue `true`
	 */
	selectable: schemaFactory.optional(schemaFactory.boolean),
}) {}
class Row extends TableSchema.row({
	schemaFactory,
	cell: Cell,
	props: schemaFactory.optional(RowProps),
}) {}

class Table extends TableSchema.table({
	schemaFactory,
	cell: Cell,
	column: Column,
	row: Row,
}) {}

describe("TableFactory unit tests", () => {
	it("compatibility", () => {
		// There is not a single fixed table schema, but instead a collection of utilities that generate table schemas.
		// Therefore, we cannot directly utilize `testSchemaCompatibilitySnapshots`, but we can apply it to one example use of TableSchema.table
		// which is what this test does.
		const currentViewSchema = new TreeViewConfiguration({ schema: Table });
		testSchemaCompatibilitySnapshots(currentViewSchema, "2.82.0", "example-table");
	});

	/**
	 * Compares a tree with an expected "concise" tree representation.
	 * Fails if they are not equivalent.
	 */
	function assertEqualTrees(actual: TreeNode, expected: ConciseTree): void {
		const actualVerbose = TreeBeta.exportConcise(actual);
		assert.deepEqual(actualVerbose, expected);
	}

	describeHydration("Column Schema", (initializeTree) => {
		it("Can create without props", () => {
			class MyColumn extends TableSchema.column({
				schemaFactory,
				cell: schemaFactory.string,
			}) {}
			const column = new MyColumn({ id: "column-0" });

			// TODO: ideally the "props" property would not exist at all on the derived class.
			// For now, it is at least an optional property and cannot be set to anything meaningful.
			type _test = requireTrue<areSafelyAssignable<undefined, MyColumn["props"]>>;
			assert.equal(column.props, undefined);
		});

		it("Can create with props", () => {
			class MyColumn extends TableSchema.column({
				schemaFactory,
				cell: schemaFactory.string,
				props: schemaFactory.string,
			}) {}
			const column = new MyColumn({ id: "column-0", props: "Column 0" });
			assert.equal(column.props, "Column 0");
		});

		it("Props can be updated after insertion", () => {
			const column = initializeTree(Column, { id: "column-0", props: {} });

			// Initial props are empty
			assertEqualTrees(column.props, {});

			// Update props and verify the new value is readable
			column.props = { label: "Updated label" };
			assertEqualTrees(column.props, { label: "Updated label" });

			// Clear the label
			column.props = {};
			assertEqualTrees(column.props, {});
		});

		it("Updating props fires nodeChanged on the column but not the column list", () => {
			const table = initializeTree(
				Table,
				Table.create({
					columns: [
						new Column({ id: "column-0", props: {} }),
						new Column({ id: "column-1", props: {} }),
					],
					rows: [],
				}),
			);

			let columnNodeChangedCount = 0;
			let columnListChangedCount = 0;

			const column0 = table.columns[0];
			Tree.on(column0, "nodeChanged", () => {
				columnNodeChangedCount++;
			});
			Tree.on(table.columns, "nodeChanged", () => {
				columnListChangedCount++;
			});

			// Update column-0 props — should fire nodeChanged on the column, not the list
			column0.props = { label: "Updated label" };
			assert.equal(columnNodeChangedCount, 1);
			assert.equal(columnListChangedCount, 0);

			// Update column-1 props — should NOT fire for column-0
			table.columns[1].props = { label: "Other label" };
			assert.equal(columnNodeChangedCount, 1);
			assert.equal(columnListChangedCount, 0);
		});
	});

	describeHydration("Row Schema", (initializeTree) => {
		it("Can create without props", () => {
			class MyCell extends schemaFactory.object("table-cell", {
				value: schemaFactory.string,
			}) {}
			class MyRow extends TableSchema.row({ schemaFactory, cell: MyCell }) {}
			const row = new MyRow({ id: "row-0", cells: {} });

			// TODO: ideally the "props" property would not exist at all on the derived class.
			// For now, it is at least an optional property and cannot be set to anything meaningful.
			type _test = requireTrue<areSafelyAssignable<undefined, MyRow["props"]>>;
			assert.equal(row.props, undefined);
		});

		it("Can create with props", () => {
			class MyCell extends schemaFactory.object("table-cell", {
				value: schemaFactory.string,
			}) {}
			class MyRow extends TableSchema.row({
				schemaFactory,
				cell: MyCell,
				props: schemaFactory.string,
			}) {}

			const column = initializeTree(MyRow, { id: "row-0", cells: {}, props: "Row 0" });
			assert.equal(column.props, "Row 0");
		});

		it("Props can be updated after insertion", () => {
			const row = initializeTree(Row, { id: "row-0", cells: {}, props: {} });

			// Initial props are empty
			assertEqualTrees(row.props ?? fail("props undefined"), {});

			// Update props and verify the new value is readable
			row.props = { selectable: true };
			assertEqualTrees(row.props ?? fail("props undefined"), { selectable: true });

			// Set props to undefined
			row.props = undefined;
			assert.equal(row.props, undefined);
		});

		it("Updating props fires nodeChanged on the row but not the row list", () => {
			const table = initializeTree(
				Table,
				Table.create({
					columns: [],
					rows: [
						new Row({ id: "row-0", cells: {}, props: {} }),
						new Row({ id: "row-1", cells: {}, props: {} }),
					],
				}),
			);

			let rowNodeChangedCount = 0;
			let rowListChangedCount = 0;

			const row0 = table.rows[0];
			Tree.on(row0, "nodeChanged", () => {
				rowNodeChangedCount++;
			});
			Tree.on(table.rows, "nodeChanged", () => {
				rowListChangedCount++;
			});

			// Update row-0 props — should fire nodeChanged on the row, not the list
			row0.props = { selectable: true };
			assert.equal(rowNodeChangedCount, 1);
			assert.equal(rowListChangedCount, 0);

			// Update row-1 props — should NOT fire for row-0
			table.rows[1].props = { selectable: false };
			assert.equal(rowNodeChangedCount, 1);
			assert.equal(rowListChangedCount, 0);
		});
	});

	describe("Table Schema", () => {
		describe("Construction", () => {
			it("Can create without custom column/row schema", () => {
				class MyTable extends TableSchema.table({
					schemaFactory,
					cell: schemaFactory.string,
				}) {}

				MyTable.create();
			});

			it("Can create with custom column schema", () => {
				const MyCell = schemaFactory.string;
				class MyColumn extends TableSchema.column({
					schemaFactory,
					cell: MyCell,
					props: schemaFactory.object("column-props", {
						label: schemaFactory.string,
					}),
				}) {}
				class MyTable extends TableSchema.table({
					schemaFactory,
					cell: MyCell,
					column: MyColumn,
				}) {}

				MyTable.create({
					columns: [{ id: "column-0", props: { label: "Column 0" } }],
					rows: [{ id: "row-0", cells: {} }],
				});
			});

			it("Can create with custom row schema", () => {
				const MyCell = schemaFactory.string;
				class MyRow extends TableSchema.row({
					schemaFactory,
					cell: MyCell,
					props: schemaFactory.object("row-props", {
						label: schemaFactory.string,
					}),
				}) {}
				class MyTable extends TableSchema.table({
					schemaFactory,
					cell: schemaFactory.string,
					row: MyRow,
				}) {}

				MyTable.create({
					columns: [{ id: "column-0" }],
					rows: [{ id: "row-0", props: { label: "Row 0" }, cells: {} }],
				});
			});

			it("Can create with custom column and row schema", () => {
				const MyCell = schemaFactory.string;
				class MyColumn extends TableSchema.column({
					schemaFactory,
					cell: MyCell,
					props: schemaFactory.object("column-props", {
						label: schemaFactory.string,
					}),
				}) {}
				class MyRow extends TableSchema.row({
					schemaFactory,
					cell: MyCell,
					props: schemaFactory.object("row-props", {
						label: schemaFactory.string,
					}),
				}) {}
				class MyTable extends TableSchema.table({
					schemaFactory,
					cell: schemaFactory.string,
					column: MyColumn,
					row: MyRow,
				}) {}

				MyTable.create({
					columns: [{ id: "column-0", props: { label: "Column 0" } }],
					rows: [{ id: "row-0", props: { label: "Row 0" }, cells: {} }],
				});
			});

			// We intentionally prevent such usage of the table schema constructor for a couple of reasons.
			// Instead, we encourage users to use the static `create` method.
			// This test exists to ensure that this does not regress.
			it("Cannot call constructor with insertable contents", () => {
				// The below structure mirrors the shape of the insertable contents accepted by the `create` method.
				// Ensure the type-system prevents passing this structure to the constructor.
				// This is also expected to fail at runtime.
				assert.throws(
					() =>
						new Table({
							// @ts-expect-error -- Constructor does not allow insertable contents
							columns: [],
							rows: [],
						}),
					validateUsageError(
						/The provided data is incompatible with all of the types allowed by the schema./,
					),
				);

				// The below structure mirrors the shape of the actual underlying tree structure, which is intended
				// to be opaque to the user.
				// This is not expected to fail at runtime, but the type-system should prevent it.
				new Table({
					// @ts-expect-error -- Constructor does not allow insertable contents
					table: {
						columns: [],
						rows: [],
					},
				});
			});

			it("Disallows inserting multiple rows with the same ID", () => {
				assert.throws(
					() =>
						Table.create({
							columns: [],
							rows: [new Row({ id: "row-0", cells: {} }), new Row({ id: "row-0", cells: {} })],
						}),
					validateUsageError(
						/Attempted to insert multiple rows with ID "row-0". Row IDs must be unique./,
					),
				);
			});

			it("Disallows inserting multiple columns with the same ID", () => {
				assert.throws(
					() =>
						Table.create({
							columns: [
								new Column({ id: "column-0", props: {} }),
								new Column({ id: "column-0", props: {} }),
							],
							rows: [],
						}),
					validateUsageError(
						/Attempted to insert multiple columns with ID "column-0". Column IDs must be unique./,
					),
				);
			});

			it("Disallows inserting rows with cells under non-existent columns", () => {
				assert.throws(
					() =>
						Table.create({
							columns: [new Column({ id: "column-0", props: {} })],
							rows: [
								new Row({
									id: "row-0",
									cells: {
										"column-1": { value: "Hello world!" },
									},
								}),
							],
						}),
					validateUsageError(
						/Attempted to insert a row containing a cell under column ID "column-1", but the table does not contain a column with that ID./,
					),
				);
			});
		});

		// Tables manage to make ids readonly at the type level:
		// this is a bit surprising since that's not currently implemented for identifiers in general,
		// but works in this case due to how interfaces are used.
		it("Readonly IDs", () => {
			const column = new Column({ props: {} });
			// Read
			const _columnId = column.id;
			assert.throws(() => {
				// Write
				// @ts-expect-error id is readonly
				column.id = "column-1";
			});
			const row = new Row({ cells: {} });
			// Read
			const _rowId = row.id;
			assert.throws(() => {
				// Write
				// @ts-expect-error id is readonly
				row.id = "row-1";
			});
		});

		describeHydration("API tests", (initializeTree) => {
			// Creates a table with 2 columns ("column-0", "column-1") and 2 rows ("row-0", "row-1").
			// All cells are initially empty.
			function create2x2Table() {
				return initializeTree(
					Table,
					Table.create({
						columns: [
							{ id: "column-0", props: {} },
							{ id: "column-1", props: {} },
						],
						rows: [
							{ id: "row-0", cells: {}, props: {} },
							{ id: "row-1", cells: {}, props: {} },
						],
					}),
				);
			}

			describe("Initialization", () => {
				it("Empty", () => {
					class MyTable extends TableSchema.table({
						schemaFactory,
						cell: schemaFactory.string,
					}) {
						// Custom property on derived class included to verify that the
						// return type of `Table.create()` is correct.
						public customProp: string = "Hello world!";
					}

					const table = initializeTree(MyTable, MyTable.create());
					assertEqualTrees(table, { table: { columns: [], rows: [] } });
					assert.strictEqual(table.customProp, "Hello world!");
				});

				it("Non-empty", () => {
					const table = initializeTree(
						Table,
						Table.create({
							columns: [
								new Column({
									id: "column-0",
									props: {
										label: "Column 0",
									},
								}),
								new Column({ id: "column-1", props: { label: "Column 1" } }),
							],
							rows: [
								{ id: "row-0", cells: {} },
								{
									id: "row-1",
									cells: {
										"column-1": { value: "Hello world!" },
									},
								},
							],
						}),
					);

					assertEqualTrees(table, {
						table: {
							columns: [
								{
									id: "column-0",
									props: { label: "Column 0" },
								},
								{
									id: "column-1",
									props: { label: "Column 1" },
								},
							],
							rows: [
								{
									id: "row-0",
									cells: {},
								},
								{
									id: "row-1",
									cells: {
										"column-1": {
											value: "Hello world!",
										},
									},
								},
							],
						},
					});
				});
			});

			describe("insertColumns", () => {
				it("Insert empty columns list", () => {
					const tree = initializeTree(Table, Table.create());

					const inserted = tree.insertColumns({ index: 0, columns: [] });
					assert.equal(inserted.length, 0);

					assertEqualTrees(tree, {
						table: {
							columns: [],
							rows: [],
						},
					});
				});

				it("Insert single column into empty list", () => {
					const table = initializeTree(Table, Table.create());

					const inserted = table.insertColumns({
						index: 0,
						columns: [
							{
								id: "column-0",
								props: {},
							},
						],
					});
					assert.equal(inserted.length, 1);
					assertEqualTrees(inserted[0], { id: "column-0", props: {} });

					assertEqualTrees(table, {
						table: {
							columns: [
								{
									id: "column-0",
									props: {},
								},
							],
							rows: [],
						},
					});
				});

				it("Insert columns into non-empty list", () => {
					const table = initializeTree(
						Table,
						Table.create({
							columns: [
								{
									id: "column-a",
									props: {},
								},
								{
									id: "column-b",
									props: {},
								},
							],
							rows: [],
						}),
					);

					const inserted = table.insertColumns({
						index: 1,
						columns: [
							{
								id: "column-c",
								props: {},
							},
							{
								id: "column-d",
								props: {},
							},
						],
					});
					assert.equal(inserted.length, 2);
					assertEqualTrees(inserted[0], { id: "column-c", props: {} });
					assertEqualTrees(inserted[1], { id: "column-d", props: {} });

					assertEqualTrees(table, {
						table: {
							columns: [
								{
									id: "column-a",
									props: {},
								},
								{
									id: "column-c",
									props: {},
								},
								{
									id: "column-d",
									props: {},
								},
								{
									id: "column-b",
									props: {},
								},
							],
							rows: [],
						},
					});
				});

				it("Append columns", () => {
					const table = initializeTree(
						Table,
						Table.create({
							columns: [
								{
									id: "column-a",
									props: {},
								},
								{
									id: "column-b",
									props: {},
								},
							],
							rows: [],
						}),
					);

					const inserted = table.insertColumns({
						columns: [
							{
								id: "column-c",
								props: {},
							},
							{
								id: "column-d",
								props: {},
							},
						],
					});
					assert.equal(inserted.length, 2);
					assertEqualTrees(inserted[0], { id: "column-c", props: {} });
					assertEqualTrees(inserted[1], { id: "column-d", props: {} });

					assertEqualTrees(table, {
						table: {
							columns: [
								{
									id: "column-a",
									props: {},
								},
								{
									id: "column-b",
									props: {},
								},
								{
									id: "column-c",
									props: {},
								},
								{
									id: "column-d",
									props: {},
								},
							],
							rows: [],
						},
					});
				});

				it("Cannot insert column with an existing ID", () => {
					const table = initializeTree(
						Table,
						Table.create({
							columns: [
								{
									id: "column-0",
									props: {},
								},
							],
							rows: [],
						}),
					);

					assert.throws(
						() =>
							table.insertColumns({
								columns: [
									{
										id: "column-0",
										props: {},
									},
								],
							}),
						validateUsageError(
							/Attempted to insert a column with ID "column-0", but a column with that ID already exists in the table./,
						),
					);
				});

				it("Cannot insert columns with duplicate IDs within the same batch", () => {
					const table = initializeTree(Table, Table.create());

					assert.throws(
						() =>
							table.insertColumns({
								columns: [
									{ id: "column-0", props: {} },
									{ id: "column-0", props: {} },
								],
							}),
						validateUsageError(
							/Attempted to insert multiple columns with ID "column-0". Column IDs must be unique./,
						),
					);
				});

				it("Insert columns at explicit boundary index (index === columns.length)", () => {
					const table = initializeTree(
						Table,
						Table.create({
							columns: [
								{ id: "column-a", props: {} },
								{ id: "column-b", props: {} },
							],
							rows: [],
						}),
					);

					// index === columns.length is equivalent to appending
					const inserted = table.insertColumns({
						index: 2,
						columns: [{ id: "column-c", props: {} }],
					});
					assert.equal(inserted.length, 1);
					assertEqualTrees(inserted[0], { id: "column-c", props: {} });
					assertEqualTrees(table, {
						table: {
							columns: [
								{ id: "column-a", props: {} },
								{ id: "column-b", props: {} },
								{ id: "column-c", props: {} },
							],
							rows: [],
						},
					});
				});
			});

			describe("insertRows", () => {
				it("Insert empty rows list", () => {
					const table = initializeTree(Table, Table.create());

					const inserted = table.insertRows({ index: 0, rows: [] });
					assert.equal(inserted.length, 0);

					assertEqualTrees(table, {
						table: {
							columns: [],
							rows: [],
						},
					});
				});

				it("Insert single row into empty list", () => {
					const table = initializeTree(Table, Table.create());

					const inserted = table.insertRows({
						index: 0,
						rows: [
							{
								id: "row-0",
								cells: {},
								props: {},
							},
						],
					});
					assert.equal(inserted.length, 1);
					assertEqualTrees(inserted[0], { id: "row-0", cells: {}, props: {} });

					assertEqualTrees(table, {
						table: {
							columns: [],
							rows: [
								{
									id: "row-0",
									cells: {},
									props: {},
								},
							],
						},
					});
				});

				it("Insert rows into non-empty list", () => {
					const table = initializeTree(
						Table,
						Table.create({
							rows: [
								{
									id: "row-a",
									cells: {},
									props: {},
								},
								{
									id: "row-b",
									cells: {},
									props: {},
								},
							],
							columns: [],
						}),
					);

					const inserted = table.insertRows({
						index: 1,
						rows: [
							{
								id: "row-c",
								cells: {},
								props: {},
							},
							{
								id: "row-d",
								cells: {},
								props: {},
							},
						],
					});
					assert.equal(inserted.length, 2);
					assertEqualTrees(inserted[0], { id: "row-c", cells: {}, props: {} });
					assertEqualTrees(inserted[1], { id: "row-d", cells: {}, props: {} });

					assertEqualTrees(table, {
						table: {
							columns: [],
							rows: [
								{
									id: "row-a",
									cells: {},
									props: {},
								},
								{
									id: "row-c",
									cells: {},
									props: {},
								},
								{
									id: "row-d",
									cells: {},
									props: {},
								},
								{
									id: "row-b",
									cells: {},
									props: {},
								},
							],
						},
					});
				});

				it("Append rows", () => {
					const table = initializeTree(
						Table,
						Table.create({
							rows: [
								{
									id: "row-a",
									cells: {},
									props: {},
								},
								{
									id: "row-b",
									cells: {},
									props: {},
								},
							],
							columns: [],
						}),
					);

					const inserted = table.insertRows({
						rows: [
							{
								id: "row-c",
								cells: {},
								props: {},
							},
							{
								id: "row-d",
								cells: {},
								props: {},
							},
						],
					});
					assert.equal(inserted.length, 2);
					assertEqualTrees(inserted[0], { id: "row-c", cells: {}, props: {} });
					assertEqualTrees(inserted[1], { id: "row-d", cells: {}, props: {} });

					assertEqualTrees(table, {
						table: {
							columns: [],
							rows: [
								{
									id: "row-a",
									cells: {},
									props: {},
								},
								{
									id: "row-b",
									cells: {},
									props: {},
								},
								{
									id: "row-c",
									cells: {},
									props: {},
								},
								{
									id: "row-d",
									cells: {},
									props: {},
								},
							],
						},
					});
				});

				it("Cannot insert row with an existing ID", () => {
					const table = initializeTree(
						Table,
						Table.create({
							columns: [],
							rows: [
								{
									id: "row-0",
									cells: {},
								},
							],
						}),
					);

					assert.throws(
						() =>
							table.insertRows({
								rows: [
									{
										id: "row-0",
										cells: {},
									},
								],
							}),
						validateUsageError(
							/Attempted to insert a row with ID "row-0", but a row with that ID already exists in the table./,
						),
					);
				});

				it("Cannot insert row with cells under non-existent columns", () => {
					const table = initializeTree(
						Table,
						Table.create({
							columns: [
								{
									id: "column-0",
									props: {},
								},
							],
							rows: [],
						}),
					);

					assert.throws(
						() =>
							table.insertRows({
								rows: [
									{
										id: "row-0",
										cells: {
											"column-1": { value: "Hello world!" },
										},
									},
								],
							}),
						validateUsageError(
							/Attempted to insert a row containing a cell under column ID "column-1", but the table does not contain a column with that ID./,
						),
					);
				});

				it("Cannot insert rows with duplicate IDs within the same batch", () => {
					const table = initializeTree(Table, Table.create());

					assert.throws(
						() =>
							table.insertRows({
								rows: [
									{ id: "row-0", cells: {} },
									{ id: "row-0", cells: {} },
								],
							}),
						validateUsageError(
							/Attempted to insert multiple rows with ID "row-0". Row IDs must be unique./,
						),
					);
				});

				it("Insert rows with pre-populated cells", () => {
					const table = initializeTree(
						Table,
						Table.create({
							columns: [
								{ id: "column-0", props: {} },
								{ id: "column-1", props: {} },
							],
							rows: [],
						}),
					);

					const inserted = table.insertRows({
						rows: [
							{
								id: "row-0",
								cells: {
									"column-0": { value: "Hello" },
									"column-1": { value: "World" },
								},
								props: {},
							},
						],
					});

					assert.equal(inserted.length, 1);
					assertEqualTrees(inserted[0], {
						id: "row-0",
						cells: {
							"column-0": { value: "Hello" },
							"column-1": { value: "World" },
						},
						props: {},
					});
					assert.equal(table.getCell({ row: "row-0", column: "column-0" })?.value, "Hello");
					assert.equal(table.getCell({ row: "row-0", column: "column-1" })?.value, "World");
				});

				it("Insert rows at explicit boundary index (index === rows.length)", () => {
					const table = initializeTree(
						Table,
						Table.create({
							columns: [],
							rows: [
								{ id: "row-a", cells: {}, props: {} },
								{ id: "row-b", cells: {}, props: {} },
							],
						}),
					);

					// index === rows.length is equivalent to appending
					const inserted = table.insertRows({
						index: 2,
						rows: [{ id: "row-c", cells: {}, props: {} }],
					});
					assert.equal(inserted.length, 1);
					assertEqualTrees(inserted[0], { id: "row-c", cells: {}, props: {} });
					assertEqualTrees(table, {
						table: {
							columns: [],
							rows: [
								{ id: "row-a", cells: {}, props: {} },
								{ id: "row-b", cells: {}, props: {} },
								{ id: "row-c", cells: {}, props: {} },
							],
						},
					});
				});
			});

			describe("setCell", () => {
				it("Set cell using string ID key", () => {
					const table = create2x2Table();

					table.setCell({
						key: { row: "row-0", column: "column-0" },
						cell: { value: "Hello world!" },
					});

					assertEqualTrees(table, {
						table: {
							columns: [
								{ id: "column-0", props: {} },
								{ id: "column-1", props: {} },
							],
							rows: [
								{
									id: "row-0",
									cells: { "column-0": { value: "Hello world!" } },
									props: {},
								},
								{ id: "row-1", cells: {}, props: {} },
							],
						},
					});
				});

				it("Set cell using index key", () => {
					const table = create2x2Table();

					// row: 1 → "row-1", column: 1 → "column-1"
					table.setCell({ key: { row: 1, column: 1 }, cell: { value: "Hello world!" } });

					assert.equal(
						table.getCell({ row: "row-1", column: "column-1" })?.value,
						"Hello world!",
					);
				});

				it("Set cell using node key", () => {
					const table = create2x2Table();
					const column = table.getColumn("column-1") ?? fail("Column not found");
					const row = table.getRow("row-1") ?? fail("Row not found");

					table.setCell({ key: { row, column }, cell: { value: "Hello world!" } });

					assert.equal(
						table.getCell({ row: "row-1", column: "column-1" })?.value,
						"Hello world!",
					);
				});

				it("Set cell overwrites existing cell", () => {
					const table = create2x2Table();
					const cellKey = { row: "row-0", column: "column-0" };

					table.setCell({ key: cellKey, cell: { value: "initial" } });
					assert.equal(table.getCell(cellKey)?.value, "initial");

					table.setCell({ key: cellKey, cell: { value: "updated" } });
					assert.equal(table.getCell(cellKey)?.value, "updated");
				});

				it("Setting cell in an invalid location errors", () => {
					const table = create2x2Table();

					// Invalid row (by string ID)
					assert.throws(
						() =>
							table.setCell({
								key: { row: "row-99", column: "column-0" },
								cell: { value: "x" },
							}),
						validateUsageError(/No row with ID "row-99" exists in the table./),
					);

					// Invalid column (by string ID)
					assert.throws(
						() =>
							table.setCell({
								key: { row: "row-0", column: "column-99" },
								cell: { value: "x" },
							}),
						validateUsageError(/No column with ID "column-99" exists in the table./),
					);

					// Invalid row (by index)
					assert.throws(
						() =>
							table.setCell({
								key: { row: 99, column: "column-0" },
								cell: { value: "x" },
							}),
						validateUsageError(/No row exists at index 99./),
					);

					// Invalid column (by index)
					assert.throws(
						() =>
							table.setCell({
								key: { row: "row-0", column: 99 },
								cell: { value: "x" },
							}),
						validateUsageError(/No column exists at index 99./),
					);

					// Negative row index
					assert.throws(
						() =>
							table.setCell({
								key: { row: -1, column: "column-0" },
								cell: { value: "x" },
							}),
						validateUsageError(/No row exists at index -1./),
					);

					// Invalid column (node not in table)
					assert.throws(
						() =>
							table.setCell({
								key: { row: "row-0", column: new Column({ id: "column-99", props: {} }) },
								cell: { value: "x" },
							}),
						validateUsageError(
							/The specified column node with ID "column-99" does not exist in the table./,
						),
					);

					// Invalid row (node not in table)
					assert.throws(
						() =>
							table.setCell({
								key: {
									row: new Row({ id: "row-99", cells: {}, props: {} }),
									column: "column-0",
								},
								cell: { value: "x" },
							}),
						validateUsageError(
							/The specified row node with ID "row-99" does not exist in the table./,
						),
					);
				});
			});

			describe("removeColumns", () => {
				it("Remove empty list", () => {
					const table = initializeTree(
						Table,
						Table.create({
							columns: [
								new Column({
									id: "column-0",
									props: {},
								}),
							],
							rows: [
								new Row({
									id: "row-0",
									cells: {
										"column-0": { value: "Hello world!" },
									},
									props: {},
								}),
							],
						}),
					);

					const removed = table.removeColumns([]);
					assert.equal(removed.length, 0);
					assertEqualTrees(table, {
						table: {
							columns: [{ id: "column-0", props: {} }],
							rows: [
								{
									id: "row-0",
									cells: {
										"column-0": { value: "Hello world!" },
									},
									props: {},
								},
							],
						},
					});
				});

				it("Remove empty range", () => {
					const table = initializeTree(
						Table,
						Table.create({
							columns: [new Column({ id: "column-0", props: {} })],
							rows: [],
						}),
					);

					const removed = table.removeColumns(0, 0);
					assert.equal(removed.length, 0);
					assertEqualTrees(table, {
						table: {
							columns: [{ id: "column-0", props: {} }],
							rows: [],
						},
					});
				});

				it("Remove single column", () => {
					const column0 = new Column({ id: "column-0", props: {} });
					const column1 = new Column({ id: "column-1", props: {} });
					const table = initializeTree(
						Table,
						Table.create({
							columns: [column0, column1],
							rows: [
								new Row({
									id: "row-0",
									cells: {
										"column-0": { value: "Hello world!" },
									},
									props: {},
								}),
							],
						}),
					);

					// Remove column0 (by node)
					const removed0 = table.removeColumns([column0]);
					assert.equal(removed0.length, 1);
					assertEqualTrees(removed0[0], { id: "column-0", props: {} });
					assertEqualTrees(table, {
						table: {
							columns: [{ id: "column-1", props: {} }],
							rows: [
								{
									id: "row-0",
									cells: {},
									props: {},
								},
							],
						},
					});

					// Remove column1 (by ID)
					const removed1 = table.removeColumns(["column-1"]);
					assert.equal(removed1.length, 1);
					assertEqualTrees(removed1[0], { id: "column-1", props: {} });
					assertEqualTrees(table, {
						table: {
							columns: [],
							rows: [
								{
									id: "row-0",
									cells: {},
									props: {},
								},
							],
						},
					});
				});

				it("Remove multiple columns", () => {
					const column0 = new Column({ id: "column-0", props: {} });
					const column1 = new Column({ id: "column-1", props: {} });
					const column2 = new Column({ id: "column-2", props: {} });
					const column3 = new Column({ id: "column-3", props: {} });
					const table = initializeTree(
						Table,
						Table.create({
							columns: [column0, column1, column2, column3],
							rows: [
								new Row({
									id: "row-0",
									cells: {
										"column-0": { value: "Hello world!" },
									},
									props: {},
								}),
							],
						}),
					);

					// Remove columns 1 and 3 (by node)
					const removed0 = table.removeColumns([column1, column3]);
					assert.equal(removed0.length, 2);
					assertEqualTrees(removed0[0], { id: "column-1", props: {} });
					assertEqualTrees(removed0[1], { id: "column-3", props: {} });
					assertEqualTrees(table, {
						table: {
							columns: [
								{ id: "column-0", props: {} },
								{ id: "column-2", props: {} },
							],
							rows: [
								{
									id: "row-0",
									cells: {
										"column-0": { value: "Hello world!" },
									},
									props: {},
								},
							],
						},
					});

					// Remove columns 2 and 0 (by ID)
					const removed1 = table.removeColumns([column2.id, column0.id]);
					assert.equal(removed1.length, 2);
					assertEqualTrees(removed1[0], { id: "column-2", props: {} });
					assertEqualTrees(removed1[1], { id: "column-0", props: {} });
					assertEqualTrees(table, {
						table: {
							columns: [],
							rows: [
								{
									id: "row-0",
									cells: {},
									props: {},
								},
							],
						},
					});
				});

				it("Remove columns by index range", () => {
					const column0 = new Column({ id: "column-0", props: {} });
					const column1 = new Column({ id: "column-1", props: {} });
					const column2 = new Column({ id: "column-2", props: {} });
					const column3 = new Column({ id: "column-3", props: {} });
					const table = initializeTree(
						Table,
						Table.create({
							columns: [column0, column1, column2, column3],
							rows: [
								new Row({
									id: "row-0",
									cells: {
										"column-0": { value: "Hello" },
										"column-2": { value: "world" },
									},
								}),
							],
						}),
					);

					// Remove columns 1-2
					const removed = table.removeColumns(1, 2);
					assert.equal(removed.length, 2);
					assertEqualTrees(removed[0], { id: "column-1", props: {} });
					assertEqualTrees(removed[1], { id: "column-2", props: {} });
					assertEqualTrees(table, {
						table: {
							columns: [
								{ id: "column-0", props: {} },
								{ id: "column-3", props: {} },
							],
							rows: [
								{
									id: "row-0",
									cells: {
										"column-0": { value: "Hello" },
									},
								},
							],
						},
					});
				});

				it("Removing a single column that doesn't exist on table errors", () => {
					const table = initializeTree(
						Table,
						Table.create({
							columns: [],
							rows: [],
						}),
					);

					assert.throws(
						() => table.removeColumns([new Column({ id: "column-0", props: {} })]),
						validateUsageError(
							/The specified column node with ID "column-0" does not exist in the table./,
						),
					);
				});

				it("Removing multiple columns errors if at least one column doesn't exist", () => {
					const column0 = new Column({ id: "column-0", props: {} });
					const table = initializeTree(
						Table,
						Table.create({
							columns: [column0],
							rows: [],
						}),
					);

					assert.throws(
						() => table.removeColumns([column0, new Column({ id: "column-1", props: {} })]),
						validateUsageError(
							/The specified column node with ID "column-1" does not exist in the table./,
						),
					);

					// Additionally, `column-0` should not have been removed.
					assert.equal(table.columns.length, 1);
				});

				it("Removing by range fails for invalid ranges", () => {
					const column0 = new Column({ id: "column-0", props: {} });
					const column1 = new Column({ id: "column-1", props: {} });
					const table = initializeTree(
						Table,
						Table.create({
							columns: [column0, column1],
							rows: [],
						}),
					);

					assert.throws(
						() => table.removeColumns(-1, undefined),
						validateUsageError(
							/Expected non-negative index passed to Table.removeColumns, got -1./,
						),
					);

					assert.throws(
						() => table.removeColumns(1, -1),
						validateUsageError(
							/Malformed range passed to Table.removeColumns. Start index 1 is greater than end index 0./,
						),
					);

					assert.throws(
						() => table.removeColumns(0, 5),
						validateUsageError(
							/Index value passed to Table.removeColumns is out of bounds. Expected at most 2, got 5./,
						),
					);

					// Additionally, no columns should have been removed.
					assert(table.columns.length === 2);
				});

				it("Remove by non-existent string ID errors", () => {
					const table = initializeTree(
						Table,
						Table.create({
							columns: [new Column({ id: "column-0", props: {} })],
							rows: [],
						}),
					);

					assert.throws(
						() => table.removeColumns(["no-such-column"]),
						validateUsageError(/No column with ID "no-such-column" exists in the table./),
					);
				});

				it("Remove from start index given no count (removes all columns from start index to end)", () => {
					const table = initializeTree(
						Table,
						Table.create({
							columns: [
								new Column({ id: "column-0", props: {} }),
								new Column({ id: "column-1", props: {} }),
								new Column({ id: "column-2", props: {} }),
							],
							rows: [],
						}),
					);

					const removed = table.removeColumns(1);
					assert.equal(removed.length, 2);
					assertEqualTrees(removed[0], { id: "column-1", props: {} });
					assertEqualTrees(removed[1], { id: "column-2", props: {} });
					assertEqualTrees(table, {
						table: {
							columns: [{ id: "column-0", props: {} }],
							rows: [],
						},
					});
				});

				it("Remove all columns (no arguments)", () => {
					const table = initializeTree(
						Table,
						Table.create({
							columns: [
								new Column({ id: "column-0", props: {} }),
								new Column({ id: "column-1", props: {} }),
							],
							rows: [],
						}),
					);

					const removed = table.removeColumns();
					assert.equal(removed.length, 2);
					assertEqualTrees(removed[0], { id: "column-0", props: {} });
					assertEqualTrees(removed[1], { id: "column-1", props: {} });
					assertEqualTrees(table, {
						table: {
							columns: [],
							rows: [],
						},
					});
				});
			});

			describe("removeRows", () => {
				it("Remove empty list", () => {
					const table = initializeTree(
						Table,
						Table.create({
							columns: [],
							rows: [
								new Row({
									id: "row-0",
									cells: {},
								}),
							],
						}),
					);

					const removed = table.removeRows([]);
					assert.equal(removed.length, 0);
					assertEqualTrees(table, {
						table: {
							columns: [],
							rows: [
								{
									id: "row-0",
									cells: {},
								},
							],
						},
					});
				});

				it("Remove single row", () => {
					const row0 = new Row({ id: "row-0", cells: {}, props: {} });
					const row1 = new Row({ id: "row-1", cells: {}, props: {} });
					const table = initializeTree(
						Table,
						Table.create({
							columns: [],
							rows: [row0, row1],
						}),
					);

					// Remove row0 (by node)
					const removed0 = table.removeRows([row0]);
					assert.equal(removed0.length, 1);
					assertEqualTrees(removed0[0], { id: "row-0", cells: {}, props: {} });
					assertEqualTrees(table, {
						table: {
							columns: [],
							rows: [{ id: "row-1", cells: {}, props: {} }],
						},
					});

					// Remove row1 (by ID)
					const removed1 = table.removeRows(["row-1"]);
					assert.equal(removed1.length, 1);
					assertEqualTrees(removed1[0], { id: "row-1", cells: {}, props: {} });
					assertEqualTrees(table, {
						table: {
							columns: [],
							rows: [],
						},
					});
				});

				it("Remove multiple rows", () => {
					const row0 = new Row({ id: "row-0", cells: {}, props: {} });
					const row1 = new Row({ id: "row-1", cells: {}, props: {} });
					const row2 = new Row({ id: "row-2", cells: {}, props: {} });
					const row3 = new Row({ id: "row-3", cells: {}, props: {} });
					const table = initializeTree(
						Table,
						Table.create({
							columns: [],
							rows: [row0, row1, row2, row3],
						}),
					);

					// Remove rows 1 and 3 (by node)
					const removed0 = table.removeRows([row1, row3]);
					assert.equal(removed0.length, 2);
					assertEqualTrees(removed0[0], { id: "row-1", cells: {}, props: {} });
					assertEqualTrees(removed0[1], { id: "row-3", cells: {}, props: {} });
					assertEqualTrees(table, {
						table: {
							columns: [],
							rows: [
								{
									id: "row-0",
									cells: {},
									props: {},
								},
								{
									id: "row-2",
									cells: {},
									props: {},
								},
							],
						},
					});

					// Remove rows 2 and 0 (by ID)
					const removed1 = table.removeRows([row2.id, row0.id]);
					assert.equal(removed1.length, 2);
					assertEqualTrees(removed1[0], { id: "row-2", cells: {}, props: {} });
					assertEqualTrees(removed1[1], { id: "row-0", cells: {}, props: {} });
					assertEqualTrees(table, {
						table: {
							columns: [],
							rows: [],
						},
					});
				});

				it("Removing single row that doesn't exist on table errors", () => {
					const table = initializeTree(
						Table,
						Table.create({
							columns: [],
							rows: [],
						}),
					);

					assert.throws(
						() => table.removeRows([new Row({ id: "row-0", cells: {}, props: {} })]),
						validateUsageError(
							/The specified row node with ID "row-0" does not exist in the table./,
						),
					);
				});

				it("Removing multiple rows errors if at least one row doesn't exist", () => {
					const row0 = new Row({ id: "row-0", cells: {}, props: {} });
					const table = initializeTree(
						Table,
						Table.create({
							columns: [],
							rows: [row0],
						}),
					);

					assert.throws(
						() => table.removeRows([row0, new Row({ id: "row-1", cells: {}, props: {} })]),
						validateUsageError(
							/The specified row node with ID "row-1" does not exist in the table./,
						),
					);

					// Additionally, `row-0` should not have been removed.
					assert.equal(table.rows.length, 1);
				});

				it("Remove empty range", () => {
					const table = initializeTree(
						Table,
						Table.create({
							columns: [],
							rows: [new Row({ id: "row-0", cells: {}, props: {} })],
						}),
					);

					const removed = table.removeRows(0, 0);
					assert.equal(removed.length, 0);
					assertEqualTrees(table, {
						table: {
							columns: [],
							rows: [{ id: "row-0", cells: {}, props: {} }],
						},
					});
				});

				it("Remove by index range", () => {
					const row0 = new Row({ id: "row-0", cells: {}, props: {} });
					const row1 = new Row({ id: "row-1", cells: {}, props: {} });
					const row2 = new Row({ id: "row-2", cells: {}, props: {} });
					const row3 = new Row({ id: "row-3", cells: {}, props: {} });
					const table = initializeTree(
						Table,
						Table.create({
							columns: [],
							rows: [row0, row1, row2, row3],
						}),
					);

					// Remove rows 1-2
					const removed = table.removeRows(1, 2);
					assert.equal(removed.length, 2);
					assertEqualTrees(removed[0], { id: "row-1", cells: {}, props: {} });
					assertEqualTrees(removed[1], { id: "row-2", cells: {}, props: {} });
					assertEqualTrees(table, {
						table: {
							columns: [],
							rows: [
								{
									id: "row-0",
									cells: {},
									props: {},
								},
								{
									id: "row-3",
									cells: {},
									props: {},
								},
							],
						},
					});
				});

				it("Removing by range fails for invalid ranges", () => {
					const row0 = new Row({ id: "row-0", cells: {}, props: {} });
					const row1 = new Row({ id: "row-1", cells: {}, props: {} });
					const table = initializeTree(
						Table,
						Table.create({
							columns: [],
							rows: [row0, row1],
						}),
					);

					assert.throws(
						() => table.removeRows(-1, undefined),
						validateUsageError(
							/Expected non-negative index passed to Table.removeRows, got -1./,
						),
					);

					assert.throws(
						() => table.removeRows(1, -1),
						validateUsageError(
							/Malformed range passed to Table.removeRows. Start index 1 is greater than end index 0./,
						),
					);

					assert.throws(
						() => table.removeRows(0, 5),
						validateUsageError(
							/Index value passed to Table.removeRows is out of bounds. Expected at most 2, got 5./,
						),
					);

					// Additionally, no rows should have been removed.
					assert(table.rows.length === 2);
				});

				it("Remove by non-existent string ID errors", () => {
					const table = initializeTree(
						Table,
						Table.create({
							columns: [],
							rows: [new Row({ id: "row-0", cells: {}, props: {} })],
						}),
					);

					assert.throws(
						() => table.removeRows(["no-such-row"]),
						validateUsageError(/No row with ID "no-such-row" exists in the table./),
					);
				});

				it("Remove from start index given no count (removes all rows from start index to end)", () => {
					const table = initializeTree(
						Table,
						Table.create({
							columns: [],
							rows: [
								new Row({ id: "row-0", cells: {}, props: {} }),
								new Row({ id: "row-1", cells: {}, props: {} }),
								new Row({ id: "row-2", cells: {}, props: {} }),
							],
						}),
					);

					const removed = table.removeRows(1);
					assert.equal(removed.length, 2);
					assertEqualTrees(removed[0], { id: "row-1", cells: {}, props: {} });
					assertEqualTrees(removed[1], { id: "row-2", cells: {}, props: {} });
					assertEqualTrees(table, {
						table: {
							columns: [],
							rows: [{ id: "row-0", cells: {}, props: {} }],
						},
					});
				});

				it("Remove all rows (no arguments)", () => {
					const table = initializeTree(
						Table,
						Table.create({
							columns: [],
							rows: [
								new Row({ id: "row-0", cells: {}, props: {} }),
								new Row({ id: "row-1", cells: {}, props: {} }),
							],
						}),
					);

					const removed = table.removeRows();
					assert.equal(removed.length, 2);
					assertEqualTrees(removed[0], { id: "row-0", cells: {}, props: {} });
					assertEqualTrees(removed[1], { id: "row-1", cells: {}, props: {} });
					assertEqualTrees(table, {
						table: {
							columns: [],
							rows: [],
						},
					});
				});

				it("Remove rows with populated cells", () => {
					const table = initializeTree(
						Table,
						Table.create({
							columns: [new Column({ id: "column-0", props: {} })],
							rows: [
								new Row({
									id: "row-0",
									cells: { "column-0": { value: "Hello" } },
									props: {},
								}),
								new Row({
									id: "row-1",
									cells: { "column-0": { value: "World" } },
									props: {},
								}),
								new Row({ id: "row-2", cells: {}, props: {} }),
							],
						}),
					);

					const removed = table.removeRows(["row-0", "row-1"]);
					assert.equal(removed.length, 2);
					assertEqualTrees(removed[0], {
						id: "row-0",
						cells: { "column-0": { value: "Hello" } },
						props: {},
					});
					assertEqualTrees(removed[1], {
						id: "row-1",
						cells: { "column-0": { value: "World" } },
						props: {},
					});
					assertEqualTrees(table, {
						table: {
							columns: [{ id: "column-0", props: {} }],
							rows: [{ id: "row-2", cells: {}, props: {} }],
						},
					});
				});
			});

			describe("removeCell", () => {
				it("Remove cell using string ID key", () => {
					const table = create2x2Table();
					const cellKey = { row: "row-0", column: "column-0" };
					table.setCell({ key: cellKey, cell: { value: "Hello world!" } });

					const removedCell = table.removeCell(cellKey);

					assert(removedCell !== undefined);
					assertEqualTrees(removedCell, { value: "Hello world!" });
					assertEqualTrees(table, {
						table: {
							columns: [
								{ id: "column-0", props: {} },
								{ id: "column-1", props: {} },
							],
							rows: [
								{ id: "row-0", cells: {}, props: {} },
								{ id: "row-1", cells: {}, props: {} },
							],
						},
					});
				});

				it("Remove cell using index key", () => {
					const table = create2x2Table();
					// row: 1 → "row-1", column: 1 → "column-1"
					table.setCell({
						key: { row: "row-1", column: "column-1" },
						cell: { value: "Hello world!" },
					});

					const removedCell = table.removeCell({ row: 1, column: 1 });

					assert(removedCell !== undefined);
					assertEqualTrees(removedCell, { value: "Hello world!" });
					assert.equal(table.getCell({ row: "row-1", column: "column-1" }), undefined);
				});

				it("Remove cell using node key", () => {
					const table = create2x2Table();
					const column = table.getColumn("column-1") ?? fail("Column not found");
					const row = table.getRow("row-1") ?? fail("Row not found");
					table.setCell({
						key: { row: "row-1", column: "column-1" },
						cell: { value: "Hello world!" },
					});

					const removedCell = table.removeCell({ row, column });

					assert(removedCell !== undefined);
					assertEqualTrees(removedCell, { value: "Hello world!" });
					assert.equal(table.getCell({ row: "row-1", column: "column-1" }), undefined);
				});

				it("Remove cell with no existing data returns undefined", () => {
					const table = create2x2Table();

					const removedCell = table.removeCell({ row: "row-0", column: "column-0" });

					assert.equal(removedCell, undefined);
					assertEqualTrees(table, {
						table: {
							columns: [
								{ id: "column-0", props: {} },
								{ id: "column-1", props: {} },
							],
							rows: [
								{ id: "row-0", cells: {}, props: {} },
								{ id: "row-1", cells: {}, props: {} },
							],
						},
					});
				});

				it("Removing cell from invalid location errors", () => {
					const table = create2x2Table();

					// Invalid row (by string ID)
					assert.throws(
						() => table.removeCell({ row: "row-99", column: "column-0" }),
						validateUsageError(/No row with ID "row-99" exists in the table./),
					);

					// Invalid column (by string ID)
					assert.throws(
						() => table.removeCell({ row: "row-0", column: "column-99" }),
						validateUsageError(/No column with ID "column-99" exists in the table./),
					);

					// Invalid row (by index)
					assert.throws(
						() => table.removeCell({ row: 99, column: "column-0" }),
						validateUsageError(/No row exists at index 99./),
					);

					// Invalid column (by index)
					assert.throws(
						() => table.removeCell({ row: "row-0", column: 99 }),
						validateUsageError(/No column exists at index 99./),
					);

					// Invalid column (node not in table)
					assert.throws(
						() =>
							table.removeCell({
								row: "row-0",
								column: new Column({ id: "column-99", props: {} }),
							}),
						validateUsageError(
							/The specified column node with ID "column-99" does not exist in the table./,
						),
					);

					// Invalid row (node not in table)
					assert.throws(
						() =>
							table.removeCell({
								row: new Row({ id: "row-99", cells: {}, props: {} }),
								column: "column-0",
							}),
						validateUsageError(
							/The specified row node with ID "row-99" does not exist in the table./,
						),
					);
				});
			});

			describe("Column / Row Reordering", () => {
				// Helper: 4-column, 0-row table for column move tests.
				function create4ColumnTable() {
					return initializeTree(
						Table,
						Table.create({
							columns: [
								new Column({ id: "column-0", props: {} }),
								new Column({ id: "column-1", props: {} }),
								new Column({ id: "column-2", props: {} }),
								new Column({ id: "column-3", props: {} }),
							],
							rows: [],
						}),
					);
				}

				// Helper: 0-column, 4-row table for row move tests.
				function create4RowTable() {
					return initializeTree(
						Table,
						Table.create({
							columns: [],
							rows: [
								new Row({ id: "row-0", cells: {}, props: {} }),
								new Row({ id: "row-1", cells: {}, props: {} }),
								new Row({ id: "row-2", cells: {}, props: {} }),
								new Row({ id: "row-3", cells: {}, props: {} }),
							],
						}),
					);
				}

				it("columns.moveToStart", () => {
					// [C0, C1, C2, C3] → move C3 to start → [C3, C0, C1, C2]
					const table = create4ColumnTable();
					table.columns.moveToStart(3);
					const ids = [...table.columns].map((c) => c.id);
					assert.deepEqual(ids, ["column-3", "column-0", "column-1", "column-2"]);
				});

				it("columns.moveToIndex", () => {
					// Runtime semantics (TreeArrayNode): moveToIndex(destinationGap, sourceIndex).
					// moveToIndex(1, 2): move C2 (source index 2) to gap 1 (between C0 and C1).
					// [C0, C1, C2, C3] → [C0, C2, C1, C3]
					const table = create4ColumnTable();
					table.columns.moveToIndex(1, 2);
					const ids = [...table.columns].map((c) => c.id);
					assert.deepEqual(ids, ["column-0", "column-2", "column-1", "column-3"]);
				});

				it("columns.moveRangeToEnd", () => {
					// [C0, C1, C2, C3] → move [C0, C1] (indices 0–1) to end → [C2, C3, C0, C1]
					const table = create4ColumnTable();
					table.columns.moveRangeToEnd(0, 2);
					const ids = [...table.columns].map((c) => c.id);
					assert.deepEqual(ids, ["column-2", "column-3", "column-0", "column-1"]);
				});

				it("columns.moveRangeToStart", () => {
					// [C0, C1, C2, C3] → move [C2, C3] (indices 2–3) to start → [C2, C3, C0, C1]
					const table = create4ColumnTable();
					table.columns.moveRangeToStart(2, 4);
					const ids = [...table.columns].map((c) => c.id);
					assert.deepEqual(ids, ["column-2", "column-3", "column-0", "column-1"]);
				});

				it("columns.moveRangeToIndex", () => {
					// Runtime semantics (TreeArrayNode): moveRangeToIndex(destinationGap, sourceStart, sourceEnd).
					// moveRangeToIndex(3, 0, 2): move [C0, C1] (indices 0–1) to gap 3 (between C2 and C3).
					// [C0, C1, C2, C3] → [C2, C0, C1, C3]
					const table = create4ColumnTable();
					table.columns.moveRangeToIndex(3, 0, 2);
					const ids = [...table.columns].map((c) => c.id);
					assert.deepEqual(ids, ["column-2", "column-0", "column-1", "column-3"]);
				});

				it("rows.moveToStart and rows.moveRangeToEnd", () => {
					// moveToStart: [R0, R1, R2, R3] → move R3 to start → [R3, R0, R1, R2]
					const table = create4RowTable();
					table.rows.moveToStart(3);
					assert.deepEqual(
						[...table.rows].map((r) => r.id),
						["row-3", "row-0", "row-1", "row-2"],
					);

					// moveRangeToEnd: [R3, R0, R1, R2] → move [R3, R0] (indices 0–1) to end → [R1, R2, R3, R0]
					table.rows.moveRangeToEnd(0, 2);
					assert.deepEqual(
						[...table.rows].map((r) => r.id),
						["row-1", "row-2", "row-3", "row-0"],
					);
				});
			});

			describe("Responding to changes", () => {
				it("Responding to any changes in the table", () => {
					const table = initializeTree(Table, Table.create());

					let eventCount = 0;

					// Bind listener to the table.
					// The "treeChanged" event will fire when the associated node or any of its descendants change.
					Tree.on(table, "treeChanged", () => {
						eventCount++;
					});

					// Add a row
					table.insertRows({
						rows: [new Row({ id: "row-0", cells: {}, props: {} })],
					});
					assert.equal(eventCount, 1);

					// Add a column
					table.insertColumns({
						columns: [
							{ id: "column-0", props: {} },
							{ id: "column-1", props: {} },
							{ id: "column-2", props: {} },
						],
					});
					assert.equal(eventCount, 2);

					// Set a cell
					table.setCell({
						key: {
							row: "row-0",
							column: "column-0",
						},
						cell: { value: "Hello world!" },
					});
					assert.equal(eventCount, 3);

					// Update cell value
					const cell =
						table.getCell({
							row: "row-0",
							column: "column-0",
						}) ?? fail("Cell not found");
					cell.value = "Updated value!";
					assert.equal(eventCount, 4);

					// Remove columns
					table.removeColumns(["column-0", "column-2"]);
					assert.equal(eventCount, 5);

					// Remove row
					table.removeRows(["row-0"]);
					assert.equal(eventCount, 6);
				});

				it("Responding to column list changes", () => {
					const table = initializeTree(Table, Table.create());

					let eventCount = 0;

					// Bind listener to the columns list, so we know when a column is added or removed.
					// The "nodeChanged" event will fire only when the specified node itself changes (i.e., its own properties change).
					Tree.on(table.columns, "nodeChanged", () => {
						eventCount++;
					});

					// Add columns
					table.insertColumns({
						columns: [
							{ id: "column-0", props: {} },
							{ id: "column-1", props: {} },
						],
					});
					assert.equal(eventCount, 1);

					// Update column props
					table.columns[0].props = { label: "Column 0" };
					assert.equal(eventCount, 1); // Event should not have fired for column node changes

					// Insert a row
					table.insertRows({ rows: [{ id: "row-0", cells: {}, props: {} }] });
					assert.equal(eventCount, 1); // Event should not have fired for row insertion

					// Re-order columns
					table.columns.moveToEnd(0);
					assert.equal(eventCount, 2);

					// Remove column
					table.removeColumns(["column-0"]);
					assert.equal(eventCount, 3);
				});

				it("Responding to row list changes", () => {
					const table = initializeTree(Table, Table.create());

					let eventCount = 0;

					// Bind listener to the rows list.
					// "nodeChanged" fires only when the rows list itself changes (inserts, removes, reorders),
					// not when individual row nodes or their cells are mutated.
					Tree.on(table.rows, "nodeChanged", () => {
						eventCount++;
					});

					// Add rows
					table.insertRows({
						rows: [
							{ id: "row-0", cells: {}, props: {} },
							{ id: "row-1", cells: {}, props: {} },
						],
					});
					assert.equal(eventCount, 1);

					// Update row props — should NOT fire
					table.rows[0].props = { selectable: true };
					assert.equal(eventCount, 1);

					// Insert a column — should NOT fire
					table.insertColumns({ columns: [{ id: "column-0", props: {} }] });
					assert.equal(eventCount, 1);

					// Set a cell — should NOT fire
					table.setCell({
						key: { row: "row-0", column: "column-0" },
						cell: { value: "x" },
					});
					assert.equal(eventCount, 1);

					// Re-order rows
					table.rows.moveToEnd(0);
					assert.equal(eventCount, 2);

					// Remove row
					table.removeRows(["row-0"]);
					assert.equal(eventCount, 3);
				});

				it("Cell changes fire treeChanged on the containing row", () => {
					const table = create2x2Table();
					const row0 = table.getRow("row-0") ?? fail("Row not found");

					let eventCount = 0;
					Tree.on(row0, "treeChanged", () => {
						eventCount++;
					});

					// Set a cell in row-0 — should fire
					table.setCell({
						key: { row: "row-0", column: "column-0" },
						cell: { value: "Hello" },
					});
					assert.equal(eventCount, 1);

					// Remove the cell from row-0 — should fire
					table.removeCell({ row: "row-0", column: "column-0" });
					assert.equal(eventCount, 2);

					// Mutate a cell in a different row — should NOT fire for row-0
					table.setCell({
						key: { row: "row-1", column: "column-0" },
						cell: { value: "World" },
					});
					assert.equal(eventCount, 2);
				});
			});

			describe("Reading values", () => {
				// Creates a fully-populated 2×2 table (column-0/1, row-0/1, all cells set).
				// Shared by getCell, getRow, and getColumn tests.
				function create2x2FilledTable() {
					const column0 = new Column({ id: "column-0", props: {} });
					const column1 = new Column({ id: "column-1", props: {} });
					const row0 = new Row({
						id: "row-0",
						cells: {
							"column-0": new Cell({ value: "0-0" }),
							"column-1": new Cell({ value: "0-1" }),
						},
						props: {},
					});
					const row1 = new Row({
						id: "row-1",
						cells: {
							"column-0": new Cell({ value: "1-0" }),
							"column-1": new Cell({ value: "1-1" }),
						},
						props: {},
					});
					const table = initializeTree(
						Table,
						Table.create({ columns: [column0, column1], rows: [row0, row1] }),
					);
					return { table, row0, row1, column0, column1 };
				}

				it("getCell", () => {
					const { table, row1, column0, column1 } = create2x2FilledTable();

					// Get cell (by indices)
					const getByIndices = table.getCell({ row: 1, column: 0 });
					assert(getByIndices !== undefined);
					assertEqualTrees(getByIndices, {
						value: "1-0",
					});

					// Get cell (by IDs)
					const getByIds = table.getCell({ row: "row-0", column: "column-0" });
					assert(getByIds !== undefined);
					assertEqualTrees(getByIds, {
						value: "0-0",
					});

					// Get cell (by nodes)
					const getByNodes = table.getCell({ row: row1, column: column1 });
					assert(getByNodes !== undefined);
					assertEqualTrees(getByNodes, {
						value: "1-1",
					});

					// Get cell (index out of bounds)
					assert(table.getCell({ row: 5, column: 0 }) === undefined);

					// Get cell (nonexistent ID)
					assert(table.getCell({ row: "row-0", column: "foo" }) === undefined);

					// Get cell (node that isn't in the table)
					assert(
						table.getCell({
							// Note, while a row with this ID exists in the table, this *node* does not.
							row: new Row({ id: "row-1", cells: {}, props: {} }),
							column: column0,
						}) === undefined,
					);
				});

				it("getRow", () => {
					const { table } = create2x2FilledTable();

					// Get row (by index)
					const getByIndex = table.getRow(1);
					assert(getByIndex !== undefined);
					assertEqualTrees(getByIndex, {
						id: "row-1",
						cells: {
							"column-0": { value: "1-0" },
							"column-1": { value: "1-1" },
						},
						props: {},
					});

					// Get row (by ID)
					const getByIds = table.getRow("row-0");
					assert(getByIds !== undefined);
					assertEqualTrees(getByIds, {
						id: "row-0",
						cells: {
							"column-0": { value: "0-0" },
							"column-1": { value: "0-1" },
						},
						props: {},
					});

					// Get row (last valid index — boundary)
					const getByLastIndex = table.getRow(1); // rows.length - 1 for a 2-row table
					assert(getByLastIndex !== undefined);
					assertEqualTrees(getByLastIndex, {
						id: "row-1",
						cells: {
							"column-0": { value: "1-0" },
							"column-1": { value: "1-1" },
						},
						props: {},
					});

					// Get row (index out of bounds)
					assert(table.getRow(5) === undefined);

					// Get row (negative index → undefined)
					assert(table.getRow(-1) === undefined);

					// Get row (nonexistent ID)
					assert(table.getRow("foo") === undefined);
				});

				it("getColumn", () => {
					const { table } = create2x2FilledTable();

					// Get column (by index)
					const getByIndex = table.getColumn(1);
					assert(getByIndex !== undefined);
					assertEqualTrees(getByIndex, {
						id: "column-1",
						props: {},
					});

					// Get column (by ID)
					const getByIds = table.getColumn("column-0");
					assert(getByIds !== undefined);
					assertEqualTrees(getByIds, {
						id: "column-0",
						props: {},
					});

					// Get column (last valid index — boundary)
					const getByLastIndex = table.getColumn(1); // columns.length - 1 for a 2-column table
					assert(getByLastIndex !== undefined);
					assertEqualTrees(getByLastIndex, {
						id: "column-1",
						props: {},
					});

					// Get column (index out of bounds)
					assert(table.getColumn(5) === undefined);

					// Get column (negative index → undefined)
					assert(table.getColumn(-1) === undefined);

					// Get column (nonexistent ID)
					assert(table.getColumn("foo") === undefined);
				});

				it("getCell returns undefined for unset cell (sparse table)", () => {
					// create2x2Table() has 2 columns and 2 rows with no cells set
					const table = create2x2Table();
					assert(table.getCell({ row: "row-0", column: "column-0" }) === undefined);
					assert(table.getCell({ row: 1, column: 1 }) === undefined);
				});
			});

			describe("Recursive tables", () => {
				it("Can create table schema with recursive types", () => {
					const mySchemaFactory = new SchemaFactoryBeta("test-recursive");
					class MyCell extends mySchemaFactory.objectRecursive("MyCell", {
						title: mySchemaFactory.string,
						subTable: mySchemaFactory.optionalRecursive([() => MyTable]),
					}) {}

					class MyColumn extends TableSchema.column({
						schemaFactory: mySchemaFactory,
						cell: MyCell,
					}) {}

					class MyRow extends TableSchema.row({
						schemaFactory: mySchemaFactory,
						cell: MyCell,
					}) {}

					class MyTable extends TableSchema.table({
						schemaFactory: mySchemaFactory,
						cell: MyCell,
						column: MyColumn,
						row: MyRow,
					}) {}

					initializeTree(
						MyTable,
						MyTable.create({
							columns: [new MyColumn({ id: "column-0" })],
							rows: [
								new MyRow({
									id: "row-0",
									cells: {
										"column-0": new MyCell({
											title: "0-0",
											subTable: MyTable.create(),
										}),
									},
								}),
							],
						}),
					);
				});
			});
		});
	});

	describe("JSON serialization", () => {
		useSnapshotDirectory("table-schema-json");

		it("schema", () => {
			takeJsonSnapshot(
				getJsonSchema(Table, {
					requireFieldsWithDefaults: false,
					keys: KeyEncodingOptions.usePropertyKeys,
				}) as unknown as JsonCompatibleReadOnly,
			);
		});

		it("data (verbose)", () => {
			const cell0 = new Cell({ value: "Hello World!" });
			const column0 = new Column({ id: "column-0", props: {} });
			const row0 = new Row({ id: "row-0", cells: { "column-0": cell0 }, props: {} });
			const table = Table.create({
				columns: [column0],
				rows: [row0],
			});

			takeJsonSnapshot(
				TreeAlpha.exportVerbose(table, {
					keys: KeyEncodingOptions.allStoredKeys,
				}) as unknown as JsonCompatibleReadOnly,
			);
		});

		it("data (concise)", () => {
			const cell0 = new Cell({ value: "Hello World!" });
			const column0 = new Column({ id: "column-0", props: {} });
			const row0 = new Row({ id: "row-0", cells: { "column-0": cell0 }, props: {} });
			const table = Table.create({
				columns: [column0],
				rows: [row0],
			});

			takeJsonSnapshot(TreeBeta.exportConcise(table, {}) as unknown as JsonCompatibleReadOnly);
		});
	});

	// Type tests validating that table schema scopes correctly prevent cross-scope assignments.
	{
		const schemaFactoryA = new SchemaFactoryBeta("scope-a");
		const schemaFactoryB = new SchemaFactoryBeta("scope-b");

		class TableA extends TableSchema.table({
			schemaFactory: schemaFactoryA,
			cell: schemaFactoryA.string,
		}) {}

		class TableB extends TableSchema.table({
			schemaFactory: schemaFactoryB,
			cell: schemaFactoryB.string,
		}) {}

		type _typeCheck = requireFalse<areSafelyAssignable<TableA, TableB>>;
	}

	// The code within the following tests is included in TSDoc comments in the source code.
	// If you need to update any of these, please update the corresponding TSDoc comments as well.
	describe("TSDoc comment examples", () => {
		it("TableSchema: Defining a Table schema", () => {
			class MyTable extends TableSchema.table({
				schemaFactory,
				cell: schemaFactory.string,
			}) {}

			const table = MyTable.create({
				columns: [{ id: "column-0" }],
				rows: [{ id: "row-0", cells: { "column-0": "Hello world!" } }],
			});

			// Don't include this line in the example docs.
			allowUnused(table);
		});

		it("TableSchema: Customizing Column and Row schema", () => {
			class MyColumn extends TableSchema.column({
				schemaFactory,
				cell: Cell,
				props: schemaFactory.object("TableColumnProps", {
					label: schemaFactory.string,
				}),
			}) {}

			class MyRow extends TableSchema.row({
				schemaFactory,
				cell: Cell,
			}) {}

			class MyTable extends TableSchema.table({
				schemaFactory,
				cell: Cell,
				column: MyColumn,
				row: MyRow,
			}) {}

			const table = MyTable.create({
				columns: [
					new MyColumn({ props: { label: "Entry" } }),
					new MyColumn({ props: { label: "Date" } }),
					new MyColumn({ props: { label: "Amount" } }),
				],
				rows: [],
			});

			// Don't include this line in the example docs.
			allowUnused(table);
		});

		it("TableSchema: Listening for changes in the table", () => {
			// #region Don't include this in the example docs.

			class MyTable extends TableSchema.table({
				schemaFactory,
				cell: schemaFactory.string,
			}) {}

			const table = MyTable.create({
				columns: [{ id: "column-0" }],
				rows: [{ id: "row-0", cells: {} }],
			});

			// #endregion

			// Listen for any changes to the table and its children.
			// The "treeChanged" event will fire when the associated node or any of its descendants change.
			Tree.on(table, "treeChanged", () => {
				// Respond to the change.
			});
		});

		it("TableSchema: Listening for changes to the rows list only", () => {
			// #region Don't include this in the example docs.

			class MyTable extends TableSchema.table({
				schemaFactory,
				cell: schemaFactory.string,
			}) {}

			const table = MyTable.create({
				columns: [{ id: "column-0" }],
				rows: [{ id: "row-0", cells: {} }],
			});

			// #endregion

			// Listen for any changes to the list of rows.
			// The "nodeChanged" event will fire only when the specified node itself changes (i.e., its own properties change).
			// In this case, the event will fire when a row is added or removed, or the order of the list is changed.
			// But it won't fire when a row's properties change, or when the row's cells change, etc.
			Tree.on(table.rows, "nodeChanged", () => {
				// Respond to the change.
			});
		});
	});

	// Shared single-client setup helper used by both "Undo/redo" and "Prevents orphan cells" tests.
	function makeUndoRedoView() {
		const provider = new TestTreeProviderLite(
			1,
			configuredSharedTree({
				jsonValidator: FormatValidatorBasic,
				minVersionForCollab: FluidClientVersion.v2_80,
			}).getFactory(),
		);
		const config = new TreeViewConfiguration({
			schema: Table,
			enableSchemaValidation: true,
		});
		const view = asAlpha(provider.trees[0].viewWith(config));
		const { undoStack, redoStack, unsubscribe } = createTestUndoRedoStacks(view.events);
		return { view, undoStack, redoStack, unsubscribe };
	}

	/**
	 * Pops the top revertible from a stack, asserts it is defined, and immediately reverts it.
	 */
	function popAndRevert(stack: { pop(): { revert(): void } | undefined }): void {
		const revertible = stack.pop();
		assert(revertible !== undefined, "Missing revertible");
		revertible.revert();
	}

	/**
	 * Creates a two-client table setup for concurrency / orphan-cell prevention tests.
	 *
	 * @remarks
	 * Initializes the primary view with {@link initialContent}, synchronizes both clients,
	 * then returns both views plus a fork of the primary view for simulating concurrent edits.
	 */
	function makeTwoClientTableView(initialContent: ReturnType<(typeof Table)["create"]>) {
		const provider = new TestTreeProviderLite(
			2,
			configuredSharedTree({
				jsonValidator: FormatValidatorBasic,
				minVersionForCollab: FluidClientVersion.v2_80,
			}).getFactory(),
		);
		const config = new TreeViewConfiguration({ schema: Table, enableSchemaValidation: true });
		const view = asAlpha(provider.trees[0].viewWith(config));
		view.initialize(initialContent);
		provider.synchronizeMessages();
		const fork = view.fork();
		const view2 = asAlpha(provider.trees[1].viewWith(config));
		return { view, table: view.root, fork, branchTable: fork.root, view2, provider };
	}

	describe("Undo/redo", () => {
		it("redo restores a column insertion that was undone", () => {
			const { view, undoStack, redoStack, unsubscribe } = makeUndoRedoView();
			view.initialize(Table.create({ columns: [], rows: [] }));

			view.root.insertColumns({ columns: [{ id: "column-0", props: {} }] });
			assert.equal(view.root.columns.length, 1);

			// Undo
			popAndRevert(undoStack);
			assert.equal(view.root.columns.length, 0);

			// Redo — column should be restored
			popAndRevert(redoStack);
			assert.equal(view.root.columns.length, 1);
			assert.equal(view.root.columns[0].id, "column-0");

			unsubscribe();
		});

		it("redo restores a row insertion that was undone", () => {
			const { view, undoStack, redoStack, unsubscribe } = makeUndoRedoView();
			view.initialize(Table.create({ columns: [], rows: [] }));

			view.root.insertRows({ rows: [{ id: "row-0", cells: {} }] });
			assert.equal(view.root.rows.length, 1);

			// Undo
			popAndRevert(undoStack);
			assert.equal(view.root.rows.length, 0);

			// Redo — row should be restored
			popAndRevert(redoStack);
			assert.equal(view.root.rows.length, 1);
			assert.equal(view.root.rows[0].id, "row-0");

			unsubscribe();
		});

		it("undo of setCell removes the cell", () => {
			const { view, undoStack, unsubscribe } = makeUndoRedoView();
			view.initialize(
				Table.create({
					columns: [new Column({ id: "column-0", props: {} })],
					rows: [new Row({ id: "row-0", cells: {} })],
				}),
			);

			view.root.setCell({
				key: { row: "row-0", column: "column-0" },
				cell: { value: "Hello" },
			});
			assert.equal(view.root.getCell({ row: "row-0", column: "column-0" })?.value, "Hello");

			popAndRevert(undoStack);
			assert.equal(view.root.getCell({ row: "row-0", column: "column-0" }), undefined);

			unsubscribe();
		});

		it("undo of setCell (overwrite) restores the previous cell value", () => {
			const { view, undoStack, unsubscribe } = makeUndoRedoView();
			view.initialize(
				Table.create({
					columns: [new Column({ id: "column-0", props: {} })],
					rows: [
						new Row({
							id: "row-0",
							cells: { "column-0": { value: "original" } },
						}),
					],
				}),
			);

			view.root.setCell({
				key: { row: "row-0", column: "column-0" },
				cell: { value: "updated" },
			});
			assert.equal(view.root.getCell({ row: "row-0", column: "column-0" })?.value, "updated");

			popAndRevert(undoStack);
			assert.equal(view.root.getCell({ row: "row-0", column: "column-0" })?.value, "original");

			unsubscribe();
		});

		it("undo of removeCell restores the cell", () => {
			const { view, undoStack, unsubscribe } = makeUndoRedoView();
			view.initialize(
				Table.create({
					columns: [new Column({ id: "column-0", props: {} })],
					rows: [
						new Row({
							id: "row-0",
							cells: { "column-0": { value: "Hello" } },
						}),
					],
				}),
			);

			view.root.removeCell({ row: "row-0", column: "column-0" });
			assert.equal(view.root.getCell({ row: "row-0", column: "column-0" }), undefined);

			popAndRevert(undoStack);
			assert.equal(view.root.getCell({ row: "row-0", column: "column-0" })?.value, "Hello");

			unsubscribe();
		});

		it("undo of column reorder restores the original order", () => {
			const { view, undoStack, unsubscribe } = makeUndoRedoView();
			view.initialize(
				Table.create({
					columns: [
						new Column({ id: "column-0", props: {} }),
						new Column({ id: "column-1", props: {} }),
						new Column({ id: "column-2", props: {} }),
					],
					rows: [],
				}),
			);

			// Move column-0 to the end: [0, 1, 2] → [1, 2, 0]
			view.root.columns.moveToEnd(0);
			assert.equal(view.root.columns[0].id, "column-1");
			assert.equal(view.root.columns[2].id, "column-0");

			popAndRevert(undoStack);
			assert.equal(view.root.columns[0].id, "column-0");
			assert.equal(view.root.columns[1].id, "column-1");
			assert.equal(view.root.columns[2].id, "column-2");

			unsubscribe();
		});

		it("undo of row reorder restores the original order", () => {
			const { view, undoStack, unsubscribe } = makeUndoRedoView();
			view.initialize(
				Table.create({
					columns: [],
					rows: [
						new Row({ id: "row-0", cells: {} }),
						new Row({ id: "row-1", cells: {} }),
						new Row({ id: "row-2", cells: {} }),
					],
				}),
			);

			// Move row-0 to the end: [0, 1, 2] → [1, 2, 0]
			view.root.rows.moveToEnd(0);
			assert.equal(view.root.rows[0].id, "row-1");
			assert.equal(view.root.rows[2].id, "row-0");

			popAndRevert(undoStack);
			assert.equal(view.root.rows[0].id, "row-0");
			assert.equal(view.root.rows[1].id, "row-1");
			assert.equal(view.root.rows[2].id, "row-2");

			unsubscribe();
		});

		it("undo of insertRows with pre-populated cells removes both the row and its cells", () => {
			const { view, undoStack, unsubscribe } = makeUndoRedoView();
			view.initialize(
				Table.create({
					columns: [new Column({ id: "column-0", props: {} })],
					rows: [],
				}),
			);

			view.root.insertRows({
				rows: [new Row({ id: "row-0", cells: { "column-0": { value: "Hello" } } })],
			});
			assert.equal(view.root.rows.length, 1);
			assert.equal(view.root.getCell({ row: "row-0", column: "column-0" })?.value, "Hello");

			popAndRevert(undoStack);
			assert.equal(view.root.rows.length, 0);

			unsubscribe();
		});

		it("multiple column inserts should be undoable if no concurrent modifications occurred", () => {
			const { view, undoStack, unsubscribe } = makeUndoRedoView();
			view.initialize(
				Table.create({
					columns: [],
					rows: [{ id: "row-0", cells: {} }],
				}),
			);

			view.root.insertColumns({
				columns: [{ id: "column-0", props: {} }],
			});

			view.root.insertColumns({
				columns: [{ id: "column-1", props: {} }],
			});

			view.root.insertColumns({
				columns: [{ id: "column-2", props: {} }],
			});

			// No changes happened concurrently, so we should be able to revert all of these changes.
			assert.equal(view.root.columns.length, 3);
			popAndRevert(undoStack);
			assert.equal(view.root.columns.length, 2);
			popAndRevert(undoStack);
			assert.equal(view.root.columns.length, 1);
			popAndRevert(undoStack);
			assert.equal(view.root.columns.length, 0);

			unsubscribe();
		});

		it("multiple row inserts should be undoable if no concurrent modifications occurred", () => {
			const { view, undoStack, unsubscribe } = makeUndoRedoView();
			view.initialize(Table.create({ columns: [], rows: [] }));

			view.root.insertRows({ rows: [{ id: "row-0", cells: {} }] });
			view.root.insertRows({ rows: [{ id: "row-1", cells: {} }] });
			assert.equal(view.root.rows.length, 2);

			popAndRevert(undoStack);
			assert.equal(view.root.rows.length, 1);
			assert.equal(view.root.rows[0].id, "row-0");

			popAndRevert(undoStack);
			assert.equal(view.root.rows.length, 0);

			unsubscribe();
		});

		it("remove column → remove column → undo → undo", () => {
			const { view, undoStack, unsubscribe } = makeUndoRedoView();
			view.initialize(
				Table.create({
					columns: [
						new Column({ id: "column-0", props: {} }),
						new Column({ id: "column-1", props: {} }),
					],
					rows: [],
				}),
			);

			view.root.removeColumns(["column-0"]);
			assert.equal(view.root.columns.length, 1);
			assert.equal(view.root.columns[0].id, "column-1");

			view.root.removeColumns(["column-1"]);
			assert.equal(view.root.columns.length, 0);

			popAndRevert(undoStack);
			assert.equal(view.root.columns.length, 1);
			assert.equal(view.root.columns[0].id, "column-1");

			popAndRevert(undoStack);
			assert.equal(view.root.columns.length, 2);

			unsubscribe();
		});

		it("remove row → remove row → undo → undo", () => {
			const { view, undoStack, unsubscribe } = makeUndoRedoView();
			view.initialize(
				Table.create({
					columns: [],
					rows: [new Row({ id: "row-0", cells: {} }), new Row({ id: "row-1", cells: {} })],
				}),
			);

			view.root.removeRows(["row-0"]);
			assert.equal(view.root.rows.length, 1);
			assert.equal(view.root.rows[0].id, "row-1");

			view.root.removeRows(["row-1"]);
			assert.equal(view.root.rows.length, 0);

			popAndRevert(undoStack);
			assert.equal(view.root.rows.length, 1);
			assert.equal(view.root.rows[0].id, "row-1");

			popAndRevert(undoStack);
			assert.equal(view.root.rows.length, 2);

			unsubscribe();
		});

		it("insert column → remove different column → undo → undo", () => {
			const { view, undoStack, unsubscribe } = makeUndoRedoView();
			view.initialize(
				Table.create({
					columns: [new Column({ id: "column-a", props: {} })],
					rows: [],
				}),
			);

			view.root.insertColumns({ columns: [{ id: "column-b", props: {} }] });
			assert.equal(view.root.columns.length, 2);

			view.root.removeColumns(["column-a"]);
			assert.equal(view.root.columns.length, 1);
			assert.equal(view.root.columns[0].id, "column-b");

			// Undo the removal
			popAndRevert(undoStack);
			assert.equal(view.root.columns.length, 2);

			// Undo the insertion
			popAndRevert(undoStack);
			assert.equal(view.root.columns.length, 1);
			assert.equal(view.root.columns[0].id, "column-a");

			unsubscribe();
		});

		it("insert row → remove different row → undo → undo", () => {
			const { view, undoStack, unsubscribe } = makeUndoRedoView();
			view.initialize(
				Table.create({
					columns: [],
					rows: [new Row({ id: "row-a", cells: {} })],
				}),
			);

			view.root.insertRows({ rows: [{ id: "row-b", cells: {} }] });
			assert.equal(view.root.rows.length, 2);

			view.root.removeRows(["row-a"]);
			assert.equal(view.root.rows.length, 1);
			assert.equal(view.root.rows[0].id, "row-b");

			// Undo the removal
			popAndRevert(undoStack);
			assert.equal(view.root.rows.length, 2);

			// Undo the insertion
			popAndRevert(undoStack);
			assert.equal(view.root.rows.length, 1);
			assert.equal(view.root.rows[0].id, "row-a");

			unsubscribe();
		});

		// #region Regression tests for column removal with associated cells

		// The below tests are regression tests which reproduce a bug where removing columns with associated cells caused constraints to be incorrectly applied. This caused subsequent undo operations to be dropped.
		// The existence of cells associated with the first column being removed is what caused the constraints to be applied, so we need to test both with and without cells to ensure the bug is fully fixed and doesn't regress.
		it("remove column (with cells) → remove column → undo → undo", () => {
			const { view, undoStack, unsubscribe } = makeUndoRedoView();
			view.initialize(
				Table.create({
					columns: [
						new Column({ id: "column-0", props: {} }),
						new Column({ id: "column-1", props: {} }),
					],
					rows: [
						new Row({
							id: "row-0",
							cells: { "column-0": { value: "Hello" } },
						}),
					],
				}),
			);

			// Remove column-0 (also removes corresponding cell in row-0).
			view.root.removeColumns(["column-0"]);
			assert.equal(view.root.columns.length, 1);

			// Remove column-1
			view.root.removeColumns(["column-1"]);

			popAndRevert(undoStack); // undo removeColumns
			assert.equal(view.root.columns.length, 1, "column-1 should have been restored");

			popAndRevert(undoStack); // undo removeColumns
			assert.equal(view.root.columns.length, 2, "column-0 should be restored");
			assert.equal(
				view.root.getCell({ row: "row-0", column: "column-0" })?.value,
				"Hello",
				"cell should be restored along with the column",
			);

			unsubscribe();
		});

		it("remove column (with cells) → insert row → undo → undo", () => {
			const { view, undoStack, unsubscribe } = makeUndoRedoView();
			view.initialize(
				Table.create({
					columns: [new Column({ id: "column-0", props: {} })],
					rows: [
						new Row({
							id: "row-0",
							cells: { "column-0": { value: "Hello" } },
						}),
					],
				}),
			);

			// Remove the column (also removes row-0's cell).
			view.root.removeColumns(["column-0"]);
			assert.equal(view.root.columns.length, 0);

			// Insert an unrelated row after the column removal.
			// This creates a subsequent commit that will force the removeColumns undo to rebase.
			view.root.insertRows({ rows: [{ id: "row-1", cells: {} }] });

			popAndRevert(undoStack); // undo insertRows
			assert.equal(view.root.rows.length, 1, "row-1 should have been removed");

			popAndRevert(undoStack); // undo removeColumns
			assert.equal(view.root.columns.length, 1, "column-0 should be restored");
			assert.equal(
				view.root.getCell({ row: "row-0", column: "column-0" })?.value,
				"Hello",
				"cell should be restored along with the column",
			);

			unsubscribe();
		});

		it("remove column (with cells) → set cell → undo → undo", () => {
			const { view, undoStack, unsubscribe } = makeUndoRedoView();
			view.initialize(
				Table.create({
					columns: [
						new Column({ id: "column-0", props: {} }),
						new Column({ id: "column-1", props: {} }),
					],
					rows: [
						new Row({
							id: "row-0",
							cells: { "column-0": { value: "Hello" } },
						}),
					],
				}),
			);

			view.root.removeColumns(["column-0"]);
			assert.equal(view.root.columns.length, 1);

			// Set a cell in the unrelated column to create the subsequent commit.
			view.root.setCell({
				key: { row: "row-0", column: "column-1" },
				cell: { value: "World" },
			});

			popAndRevert(undoStack); // undo setCell
			assert.equal(
				view.root.getCell({ row: "row-0", column: "column-1" }),
				undefined,
				"cell in column-1 should have been removed",
			);

			popAndRevert(undoStack); // undo removeColumns
			assert.equal(view.root.columns.length, 2, "both columns should be restored");
			assert.equal(
				view.root.getCell({ row: "row-0", column: "column-0" })?.value,
				"Hello",
				"cell should be restored along with column-0",
			);

			unsubscribe();
		});

		// #endregion
	});

	describe("Prevents orphan cells", () => {
		it("column removal does not orphan cells from concurrently added rows", () => {
			const { view, table, fork, branchTable, view2, provider } = makeTwoClientTableView(
				Table.create({
					columns: [new Column({ id: "column-0", props: {} })],
					rows: [],
				}),
			);

			// Remove a column on the branch - this adds a constraint to detect concurrent row additions
			branchTable.removeColumns(["column-0"]);
			assert.equal(branchTable.columns.length, 0);

			// Concurrently add a row with a cell under the column being removed.
			// Without the constraint, this would create an orphaned cell (a cell under a non-existent column).
			view2.root.insertRows({
				rows: [{ id: "row-0", cells: { "column-0": { value: "Hello" } } }],
			});
			provider.synchronizeMessages();
			assert.equal(table.rows.length, 1);
			assert.equal(table.getCell({ row: "row-0", column: "column-0" })?.value, "Hello");

			// The column removal is dropped because it would orphan the newly added cell
			fork.rebaseOnto(view);
			assert.equal(branchTable.columns.length, 1);
			assert.equal(branchTable.columns[0].id, "column-0");
			assert.equal(branchTable.getCell({ row: "row-0", column: "column-0" })?.value, "Hello");
		});

		it("undo of insertColumns is dropped when it would orphan cells in subsequently added rows", () => {
			const { view, undoStack, unsubscribe } = makeUndoRedoView();
			view.initialize(Table.create({ columns: [], rows: [] }));
			// Insert a column - this adds a revert constraint to detect row additions before undo
			view.root.insertColumns({
				columns: [{ id: "column-0", props: {} }],
			});
			const revertible = undoStack.pop();
			assert(revertible !== undefined, "Missing revertible");
			assert.equal(view.root.columns.length, 1);

			// Add a row with a cell in the new column.
			// Without the constraint, undoing the column insertion would orphan this cell.
			view.root.insertRows({
				rows: [{ id: "row-0", cells: { "column-0": { value: "Hello" } } }],
			});
			assert.equal(view.root.getCell({ row: "row-0", column: "column-0" })?.value, "Hello");

			revertible.revert();

			// The revert is dropped because it would orphan the cell - column and cell remain
			assert.equal(view.root.columns.length, 1);
			assert.equal(view.root.rows.length, 1);
			assert.equal(view.root.columns[0].id, "column-0");
			assert.equal(view.root.getCell({ row: "row-0", column: "column-0" })?.value, "Hello");

			unsubscribe();
		});

		it("insertRows is dropped when concurrently removed column would orphan its cells", () => {
			const { view, unsubscribe } = makeUndoRedoView();
			view.initialize(
				Table.create({
					columns: [new Column({ id: "column-0", props: {} })],
					rows: [],
				}),
			);

			const table = view.root;
			const fork = view.fork();
			const branchTable = fork.root;

			// Insert a row with a cell on the branch - this adds a constraint on the column
			branchTable.insertRows({
				rows: [{ id: "row-0", cells: { "column-0": { value: "Hello" } } }],
			});
			assert.equal(branchTable.rows.length, 1);
			assert.equal(branchTable.getCell({ row: "row-0", column: "column-0" })?.value, "Hello");

			// Concurrently remove the column. Without the constraint, the row's cell would be orphaned.
			table.removeColumns(["column-0"]);
			assert.equal(table.columns.length, 0);

			// Row insertion is dropped because its cell would be orphaned
			fork.rebaseOnto(view);
			assert.equal(branchTable.rows.length, 0);

			unsubscribe();
		});

		it("undo of removeRows is dropped when column removal would orphan the restored row's cells", () => {
			const { view, table, fork, branchTable, view2, provider } = makeTwoClientTableView(
				Table.create({
					columns: [new Column({ id: "column-0", props: {} })],
					rows: [
						new Row({
							id: "row-0",
							cells: { "column-0": new Cell({ value: "Hello" }) },
						}),
					],
				}),
			);
			const { undoStack, unsubscribe } = createTestUndoRedoStacks(fork.events);

			// Remove the row (which has a cell) - this adds a revert constraint on the column
			branchTable.removeRows(["row-0"]);
			assert.equal(branchTable.rows.length, 0);
			popAndRevert(undoStack);

			// Row should be restored on the branch
			assert.equal(branchTable.rows.length, 1);
			assert.equal(branchTable.getCell({ row: "row-0", column: "column-0" })?.value, "Hello");

			// Concurrently remove the column. Without the constraint, undoing row removal would orphan its cell.
			view2.root.removeColumns(["column-0"]);
			provider.synchronizeMessages();
			assert.equal(table.columns.length, 0);

			// The undo is dropped because restoring the row would create an orphaned cell
			fork.rebaseOnto(view);
			assert.equal(branchTable.rows.length, 0);

			unsubscribe();
		});

		it("setCell is dropped when concurrently removed column would orphan the cell", () => {
			const { view, table, fork, branchTable, view2, provider } = makeTwoClientTableView(
				Table.create({
					columns: [new Column({ id: "column-0", props: {} })],
					rows: [new Row({ id: "row-0", cells: {} })],
				}),
			);

			// Set a cell on the branch - this adds a constraint on the column
			branchTable.setCell({
				key: { row: "row-0", column: "column-0" },
				cell: new Cell({ value: "test" }),
			});
			assert.equal(branchTable.getCell({ row: "row-0", column: "column-0" })?.value, "test");

			// Concurrently remove the column. Without the constraint, the cell would be orphaned.
			view2.root.removeColumns(["column-0"]);
			provider.synchronizeMessages();
			assert.equal(table.columns.length, 0);

			// setCell is dropped because the cell would be orphaned under the removed column
			fork.rebaseOnto(view);
			assert.equal(branchTable.columns.length, 0);
			assert.equal(branchTable.getCell({ row: "row-0", column: "column-0" }), undefined);
		});

		it("undo of removeCell is dropped when column removal would orphan the restored cell", () => {
			const { view, table, fork, branchTable, view2, provider } = makeTwoClientTableView(
				Table.create({
					columns: [new Column({ id: "column-0", props: {} })],
					rows: [
						new Row({
							id: "row-0",
							cells: { "column-0": new Cell({ value: "initial" }) },
						}),
					],
				}),
			);
			const { undoStack, unsubscribe } = createTestUndoRedoStacks(fork.events);

			// Remove a cell on the branch - this adds a revert constraint on the column
			branchTable.removeCell({ row: "row-0", column: "column-0" });
			assert.equal(branchTable.getCell({ row: "row-0", column: "column-0" }), undefined);
			popAndRevert(undoStack);

			// Cell should be restored on the branch
			assert.equal(
				branchTable.getCell({ row: "row-0", column: "column-0" })?.value,
				"initial",
			);

			// Concurrently remove the column. Without the constraint, undoing cell removal would orphan the cell.
			view2.root.removeColumns(["column-0"]);
			provider.synchronizeMessages();
			assert.equal(table.columns.length, 0);

			// The undo is dropped because restoring the cell would orphan it under the removed column
			fork.rebaseOnto(view);
			assert.equal(branchTable.columns.length, 0);
			assert.equal(branchTable.getCell({ row: "row-0", column: "column-0" }), undefined);

			unsubscribe();
		});

		it("undo of insertColumns is dropped when it would orphan cells inserted via setCell", () => {
			const { view, undoStack, unsubscribe } = makeUndoRedoView();
			view.initialize(
				Table.create({
					columns: [],
					rows: [{ id: "row-0", cells: {} }],
				}),
			);

			// Insert a column - this adds a revert constraint to detect cell insertions/replacements before undo
			view.root.insertColumns({
				columns: [{ id: "column-0", props: {} }],
			});
			const revertible = undoStack.pop();
			assert(revertible !== undefined, "Missing revertible");
			assert.equal(view.root.columns.length, 1);

			// Set a cell in the new column
			// Without the constraint, undoing the column insertion would orphan this cell
			view.root.setCell({
				key: { row: "row-0", column: "column-0" },
				cell: new Cell({ value: "Hello" }),
			});
			assert.equal(view.root.getCell({ row: "row-0", column: "column-0" })?.value, "Hello");

			revertible.revert();

			// The revert is dropped because it would orphan the cell - column and cell remain
			assert.equal(view.root.columns.length, 1);
			assert.equal(view.root.columns[0].id, "column-0");
			assert.equal(view.root.getCell({ row: "row-0", column: "column-0" })?.value, "Hello");

			unsubscribe();
		});

		it("removeColumns is dropped when concurrently set cell would create orphaned cells", () => {
			const { view, table, fork, branchTable, view2, provider } = makeTwoClientTableView(
				Table.create({
					columns: [{ id: "column-0", props: {} }],
					rows: [{ id: "row-0", cells: {} }],
				}),
			);

			// Remove a column on the branch - this adds a constraint to detect concurrent cell insertions/replacements
			branchTable.removeColumns(["column-0"]);
			assert.equal(branchTable.columns.length, 0);

			// Concurrently insert a cell in the column being removed via setCell.
			// Without the constraint, this is the cell that would be orphaned by the column removal.
			view2.root.setCell({
				key: { row: "row-0", column: "column-0" },
				cell: new Cell({ value: "Hello" }),
			});
			provider.synchronizeMessages();
			assert.equal(table.getCell({ row: "row-0", column: "column-0" })?.value, "Hello");

			// The column removal is dropped because it would orphan the cell
			fork.rebaseOnto(view);
			assert.equal(branchTable.columns.length, 1);
			assert.equal(branchTable.columns[0].id, "column-0");
			assert.equal(branchTable.getCell({ row: "row-0", column: "column-0" })?.value, "Hello");
		});

		it("undo of setCell is dropped when column removal would orphan the restored cell", () => {
			const { view, table, fork, branchTable, view2, provider } = makeTwoClientTableView(
				Table.create({
					columns: [{ id: "column-0", props: {} }],
					rows: [{ id: "row-0", cells: { "column-0": { value: "initial" } } }],
				}),
			);
			const { undoStack, unsubscribe } = createTestUndoRedoStacks(fork.events);

			// Replace a cell on the branch - this adds a revert constraint on the column
			branchTable.setCell({
				key: { row: "row-0", column: "column-0" },
				cell: new Cell({ value: "updated" }),
			});
			assert.equal(
				branchTable.getCell({ row: "row-0", column: "column-0" })?.value,
				"updated",
			);
			popAndRevert(undoStack);

			// Cell should be restored to initial value on the branch
			assert.equal(
				branchTable.getCell({ row: "row-0", column: "column-0" })?.value,
				"initial",
			);

			// Concurrently remove the column. Without the constraint, undoing setCell would restore a cell under a removed column.
			view2.root.removeColumns(["column-0"]);
			provider.synchronizeMessages();
			assert.equal(table.columns.length, 0);

			// The undo is dropped because it would restore a cell for a non-existent column
			fork.rebaseOnto(view);
			assert.equal(branchTable.columns.length, 0);
			assert.equal(branchTable.getCell({ row: "row-0", column: "column-0" }), undefined);

			unsubscribe();
		});

		it("undo of removeRows is dropped when its rows had cells in a subsequently removed column", () => {
			const { view, undoStack, unsubscribe } = makeUndoRedoView();
			view.initialize(
				Table.create({
					columns: [new Column({ id: "column-0", props: {} })],
					rows: [
						new Row({
							id: "row-0",
							cells: { "column-0": new Cell({ value: "Hello" }) },
						}),
					],
				}),
			);

			// Remove the row (which has a cell in column-0) — adds a revert constraint on column-0
			view.root.removeRows(["row-0"]);
			assert.equal(view.root.rows.length, 0);
			const revertible = undoStack.pop();
			assert(revertible !== undefined, "Missing revertible");

			// Now remove column-0 — invalidates the revert constraint
			view.root.removeColumns(["column-0"]);
			assert.equal(view.root.columns.length, 0);

			// The undo is dropped because restoring row-0 would recreate its cell under the now-removed column-0
			revertible.revert();
			assert.equal(view.root.rows.length, 0);

			unsubscribe();
		});

		// TODO: Once we have more granular constraints for table operations, this should ideally pass.
		// For now, our constraints are overly conservative, and the scenario below fails.
		it.skip("insertRows with no cells is not dropped when a column is concurrently removed", () => {
			const { view, unsubscribe } = makeUndoRedoView();
			view.initialize(
				Table.create({
					columns: [new Column({ id: "column-0", props: {} })],
					rows: [],
				}),
			);

			const fork = view.fork();
			const branchTable = fork.root;

			// Insert a row with NO cells on the branch — no column constraint should be added
			branchTable.insertRows({ rows: [{ id: "row-0", cells: {} }] });
			assert.equal(branchTable.rows.length, 1);

			// Concurrently remove the column on the main view
			view.root.removeColumns(["column-0"]);
			assert.equal(view.root.columns.length, 0);

			// The row insertion survives because it had no cells to orphan
			fork.rebaseOnto(view);
			assert.equal(branchTable.rows.length, 1);
			assert.equal(branchTable.rows[0].id, "row-0");

			unsubscribe();
		});

		it("removeColumns is dropped when concurrent insertRows adds cells for the removed column across multiple rows", () => {
			const { view, unsubscribe } = makeUndoRedoView();
			view.initialize(
				Table.create({
					columns: [new Column({ id: "column-0", props: {} })],
					rows: [],
				}),
			);

			const fork = view.fork();
			const branchTable = fork.root;

			// Branch removes the column — adds a noChange constraint on the row array
			branchTable.removeColumns(["column-0"]);
			assert.equal(branchTable.columns.length, 0);

			// Main view concurrently inserts multiple rows each with a cell in the removed column
			view.root.insertRows({
				rows: [
					new Row({ id: "row-0", cells: { "column-0": { value: "A" } } }),
					new Row({ id: "row-1", cells: { "column-0": { value: "B" } } }),
				],
			});
			assert.equal(view.root.rows.length, 2);

			// The column removal is dropped because it would orphan cells in both newly added rows
			fork.rebaseOnto(view);
			assert.equal(branchTable.columns.length, 1);
			assert.equal(branchTable.columns[0].id, "column-0");
			assert.equal(branchTable.getCell({ row: "row-0", column: "column-0" })?.value, "A");
			assert.equal(branchTable.getCell({ row: "row-1", column: "column-0" })?.value, "B");

			unsubscribe();
		});
	});
});
