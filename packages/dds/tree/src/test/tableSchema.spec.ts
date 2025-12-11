/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert, fail } from "node:assert";
import { validateUsageError } from "@fluidframework/test-runtime-utils/internal";

import { Tree, TreeAlpha } from "../shared-tree/index.js";
import {
	allowUnused,
	getJsonSchema,
	KeyEncodingOptions,
	SchemaFactoryAlpha,
	SchemaFactoryBeta,
	TreeBeta,
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
import { takeJsonSnapshot, useSnapshotDirectory } from "./snapshots/index.js";
// eslint-disable-next-line import-x/no-internal-modules
import { describeHydration } from "./simple-tree/utils.js";

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
	});

	describeHydration("Initialization", (initializeTree) => {
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
			assert(table.customProp === "Hello world!");
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

	describeHydration("insertColumns", (initializeTree) => {
		it("Insert empty columns list", () => {
			const tree = initializeTree(Table, Table.create());

			tree.insertColumns({ index: 0, columns: [] });

			assertEqualTrees(tree, {
				table: {
					columns: [],
					rows: [],
				},
			});
		});

		it("Insert single column into empty list", () => {
			const table = initializeTree(Table, Table.create());

			table.insertColumns({
				index: 0,
				columns: [
					{
						id: "column-0",
						props: {},
					},
				],
			});

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

			table.insertColumns({
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

			table.insertColumns({
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
	});

	describeHydration("insertRows", (initializeTree) => {
		it("Insert empty rows list", () => {
			const table = initializeTree(Table, Table.create());

			table.insertRows({ index: 0, rows: [] });

			assertEqualTrees(table, {
				table: {
					columns: [],
					rows: [],
				},
			});
		});

		it("Insert single row into empty list", () => {
			const table = initializeTree(Table, Table.create());

			table.insertRows({
				index: 0,
				rows: [
					{
						id: "row-0",
						cells: {},
						props: {},
					},
				],
			});

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

			table.insertRows({
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

			table.insertRows({
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
	});

	describeHydration("setCell", (initializeTree) => {
		it("Set cell in a valid location", () => {
			const table = initializeTree(
				Table,
				Table.create({
					columns: [
						{
							id: "column-0",
							props: {},
						},
					],
					rows: [
						{
							id: "row-0",
							cells: {},
							props: {},
						},
					],
				}),
			);

			// By not specifying an index, the column should be appended to the end of the list.
			table.setCell({
				key: {
					row: "row-0",
					column: "column-0",
				},
				cell: { value: "Hello world!" },
			});

			assertEqualTrees(table, {
				table: {
					columns: [
						{
							id: "column-0",
							props: {},
						},
					],
					rows: [
						{
							id: "row-0",
							cells: {
								"column-0": {
									value: "Hello world!",
								},
							},
							props: {},
						},
					],
				},
			});
		});

		it("Setting cell in an invalid location errors", () => {
			const table = initializeTree(
				Table,
				Table.create({
					columns: [
						{
							id: "column-0",
							props: {},
						},
					],
					rows: [
						{
							id: "row-0",
							cells: {},
							props: {},
						},
					],
				}),
			);

			// Invalid row
			assert.throws(
				() =>
					table.setCell({
						key: {
							row: "row-1",
							column: "column-0",
						},
						cell: { value: "Hello world!" },
					}),
				validateUsageError(/No row with ID "row-1" exists in the table./),
			);

			// Invalid column
			assert.throws(
				() =>
					table.setCell({
						key: {
							row: "row-0",
							column: "column-1",
						},
						cell: { value: "Hello world!" },
					}),
				validateUsageError(/No column with ID "column-1" exists in the table./),
			);
		});
	});

	describeHydration("removeColumns", (initializeTree) => {
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

			table.removeColumns([]);
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

			table.removeColumns(0, 0);
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
			table.removeColumns([column0]);
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
			table.removeColumns(["column-1"]);
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
			table.removeColumns([column1, column3]);
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
			table.removeColumns([column2.id, column0.id]);
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
			table.removeColumns(1, 2);
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
	});

	describeHydration("removeRows", (initializeTree) => {
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

			table.removeRows([]);
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
			table.removeRows([row0]);
			assertEqualTrees(table, {
				table: {
					columns: [],
					rows: [{ id: "row-1", cells: {}, props: {} }],
				},
			});

			// Remove row1 (by ID)
			table.removeRows(["row-1"]);
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
			table.removeRows([row1, row3]);
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
			table.removeRows([row2.id, row0.id]);
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

			table.removeRows(0, 0);
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
			table.removeRows(1, 2);
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
				validateUsageError(/Expected non-negative index passed to Table.removeRows, got -1./),
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
	});

	describeHydration("removeCell", (initializeTree) => {
		it("Remove cell in valid location with existing data", () => {
			const table = initializeTree(
				Table,
				Table.create({
					columns: [
						{
							id: "column-0",
							props: {},
						},
					],
					rows: [
						{
							id: "row-0",
							cells: {},
							props: {},
						},
					],
				}),
			);
			const cellKey = {
				row: "row-0",
				column: "column-0",
			};
			table.setCell({
				key: cellKey,
				cell: { value: "Hello world!" },
			});
			table.removeCell(cellKey);
			assertEqualTrees(table, {
				table: {
					columns: [
						{
							id: "column-0",
							props: {},
						},
					],
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

		it("Remove cell in valid location with no data", () => {
			const table = initializeTree(
				Table,
				Table.create({
					columns: [
						{
							id: "column-0",
							props: {},
						},
					],
					rows: [
						{
							id: "row-0",
							cells: {},
							props: {},
						},
					],
				}),
			);
			const cellKey = {
				row: "row-0",
				column: "column-0",
			};
			table.removeCell(cellKey);
			assertEqualTrees(table, {
				table: {
					columns: [
						{
							id: "column-0",
							props: {},
						},
					],
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

		it("Removing cell from nonexistent row and column errors", () => {
			const table = initializeTree(
				Table,
				Table.create({
					columns: [
						{
							id: "column-0",
							props: {},
						},
					],
					rows: [
						{
							id: "row-0",
							cells: {},
							props: {},
						},
					],
				}),
			);

			// Invalid row
			assert.throws(
				() =>
					table.removeCell({
						row: "row-1",
						column: "column-0",
					}),
				validateUsageError(/No row with ID "row-1" exists in the table./),
			);

			// Invalid column
			assert.throws(
				() =>
					table.removeCell({
						row: "row-0",
						column: "column-1",
					}),
				validateUsageError(/No column with ID "column-1" exists in the table./),
			);
		});
	});

	describeHydration("Responding to changes", (initializeTree) => {
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
	});

	describeHydration("Reading values", (initializeTree) => {
		it("getCell", () => {
			const cell00 = new Cell({ value: "0-0" });
			const cell01 = new Cell({ value: "0-1" });
			const cell10 = new Cell({ value: "1-0" });
			const cell11 = new Cell({ value: "1-1" });
			const column0 = new Column({ id: "column-0", props: {} });
			const column1 = new Column({ id: "column-1", props: {} });
			const row0 = new Row({
				id: "row-0",
				cells: {
					"column-0": cell00,
					"column-1": cell01,
				},
				props: {},
			});
			const row1 = new Row({
				id: "row-1",
				cells: { "column-0": cell10, "column-1": cell11 },
				props: {},
			});

			const table = initializeTree(
				Table,
				Table.create({
					columns: [column0, column1],
					rows: [row0, row1],
				}),
			);

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
			const cell00 = new Cell({ value: "0-0" });
			const cell01 = new Cell({ value: "0-1" });
			const cell10 = new Cell({ value: "1-0" });
			const cell11 = new Cell({ value: "1-1" });
			const column0 = new Column({ id: "column-0", props: {} });
			const column1 = new Column({ id: "column-1", props: {} });
			const row0 = new Row({
				id: "row-0",
				cells: {
					"column-0": cell00,
					"column-1": cell01,
				},
				props: {},
			});
			const row1 = new Row({
				id: "row-1",
				cells: { "column-0": cell10, "column-1": cell11 },
				props: {},
			});

			const table = initializeTree(
				Table,
				Table.create({
					columns: [column0, column1],
					rows: [row0, row1],
				}),
			);

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

			// Get row (index out of bounds)
			assert(table.getRow(5) === undefined);

			// Get row (nonexistent ID)
			assert(table.getRow("foo") === undefined);
		});

		it("getRow", () => {
			const cell00 = new Cell({ value: "0-0" });
			const cell01 = new Cell({ value: "0-1" });
			const cell10 = new Cell({ value: "1-0" });
			const cell11 = new Cell({ value: "1-1" });
			const column0 = new Column({ id: "column-0", props: {} });
			const column1 = new Column({ id: "column-1", props: {} });
			const row0 = new Row({
				id: "row-0",
				cells: {
					"column-0": cell00,
					"column-1": cell01,
				},
				props: {},
			});
			const row1 = new Row({
				id: "row-1",
				cells: { "column-0": cell10, "column-1": cell11 },
				props: {},
			});

			const table = initializeTree(
				Table,
				Table.create({
					columns: [column0, column1],
					rows: [row0, row1],
				}),
			);

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

			// Get column (index out of bounds)
			assert(table.getColumn(5) === undefined);

			// Get column (nonexistent ID)
			assert(table.getColumn("foo") === undefined);
		});
	});

	describeHydration("Recursive tables", (initializeTree) => {
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
});
