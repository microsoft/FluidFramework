---
"fluid-framework": minor
"@fluidframework/tree": minor
"__section": tree
---
New TableSchema (alpha) APIs

A `TableSchema` utility has been added to Shared Tree for managing dynamic, tabular data.
This new `TableSchema` namespace contains APIs for creating column, row, and table [node schema](https://fluidframework.com/docs/api/fluid-framework/treenodeschema-typealias).

Note: these APIs require the use of [SchemaFactoryAlpha](https://fluidframework.com/docs/api/fluid-framework/schemafactoryalpha-class).

> [!WARNING]
> These APIs are in preview and are subject to change.
> Until these APIs have stabilized, it is not recommended to use them in production code.
> There may be breaking changes to these APIs and their underlying data format.
> Using these APIs in production code may result in data loss or corruption.

#### Creating a table

You can craft a table schema with `TableSchema.table`.
This includes providing a schema for the cells that will appear in the table:

```typescript
class MyTable extends TableSchema.table({
	schemaFactory,
	cell: schemaFactory.string,
}) {}

const table = new MyTable({
	columns: [{ id: "column-0" }],
	rows: [{ id: "row-0", cells: { "column-0": "Hello world!" } }],
});
```

#### Creating a table with custom column and row schema

To associate additional data with your rows or columns, generate custom row and column schema using `TableSchema.column` and `TableSchema.row`.
These schema can then be provided to `TableSchema.table`:

```typescript
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

const table = new MyTable({
	columns: [
		new MyColumn({ props: { label: "Entry" } }),
		new MyColumn({ props: { label: "Date" } }),
		new MyColumn({ props: { label: "Amount" } }),
	],
	rows: [],
});
```

#### Interacting with the table

Table trees created using `TableSchema` offer various APIs to make working with tabular data easy.
These include:

- Insertion and removal of columns, rows, and cells.
- Cell access by column/row.

```typescript
// Create an empty table
const table = MyTable.empty();

const column0 = new MyColumn({
	props: { label: "Column 0" },
});

// Append a column to the end of the table.
table.insertColumn({
	column: column0,
});

const rows = [
	new MyRow({ cells: { } }),
	new MyRow({ cells: { } }),
];

// Insert rows at the beginning of the table.
table.insertRows({
	index: 0,
	rows,
});

// Set cell at row 0, column 0.
table.setCell({
	key: {
		column: column0,
		row: rows[0],
	},
	cell: "Hello",
});

// Set cell at row 1, column 0.
table.setCell({
	key: {
		column: column0,
		row: rows[1],
	},
	cell: "World",
});

// Remove the first row.
// Note: this will also remove the row's cell.
table.removeRow(rows[0]);

// Remove the column.
// Note: this will *not* remove the remaining cell under this column.
table.removeColumn(column0);
```

#### Listening for changes

Listening for changes to table trees behaves just like it would for any other nodes in a Shared Tree (see [here](https://fluidframework.com/docs/data-structures/tree/events) for more details).

The most straightforward option is to listen for any changes to the table node and its descendants.
For example:

```typescript
class Cell extends schemaFactory.object("TableCell", {
	value: schemaFactory.string,
}) {}

class Table extends TableSchema.table({
	schemaFactory,
	cell: Cell,
}) {}

const table = new Table({
	columns: [{ id: "column-0" }],
	rows: [{ id: "row-0", cells: {} }],
});

// Listen for any changes to the table and its children.
// The "treeChanged" event will fire when the `table` node or any of its descendants change.
Tree.on(table, "treeChanged", () => {
	// Respond to the change.
});
```

If you need more granular eventing to meet your performance needs, that is possible as well.
For example, if you wish to know when the table's list of rows changes, you could do the following:

```typescript
class Cell extends schemaFactory.object("TableCell", {
	value: schemaFactory.string,
}) {}

class Table extends TableSchema.table({
	schemaFactory,
	cell: Cell,
}) {}

const table = new Table({
	columns: [{ id: "column-0" }],
	rows: [{ id: "row-0", cells: {} }],
});

// Listen for any changes to the list of rows.
// The "nodeChanged" event will fire only when the `rows` node itself changes (i.e., its own properties change).
// In this case, the event will fire when a row is added or removed, or the order of the list is changed.
// But it won't fire when a row's properties change, or when the row's cells change, etc.
Tree.on(table.rows, "nodeChanged", () => {
	// Respond to the change.
});
```

#### Limitations

##### Orphaned cells

Cells in the table may become "orphaned."
That is, it is possible to enter a state where one or more rows contain cells with no corresponding column.
To reduce the likelihood of this, you can manually remove corresponding cells when removing columns.

For example:

```typescript
// Remove column1 and all of its cells.
// The "transaction" method will ensure that all changes are applied atomically.
Tree.runTransaction(table, () => {
	// Remove column1
	table.removeColumn(column1);

	// Remove the cell at column1 for each row.
	for (const row of table.rows) {
		table.removeCell({
			column: column1,
			row,
		});
	}
});
```

> [!WARNING]
> Note that even with the above precaution, it is possible to enter such an orphaned cell state via the merging of edits.
> For example: one client might add a row while another concurrently removes a column, orphaning the cell where the column and row intersected.
