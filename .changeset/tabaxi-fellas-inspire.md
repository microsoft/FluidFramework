---
"fluid-framework": minor
"@fluidframework/tree": minor
"__section": tree
---
TableSchema (alpha) APIs have been added

A `TableSchema` utility has been added to Shared Tree for managing dynamic, tabular data.
This new `TableSchema` namespace contains APIs for creating column, row, and table [node schema](https://fluidframework.com/docs/api/fluid-framework/treenodeschema-typealias).

Note: these APIs require the use of [SchemaFactoryAlpha](https://fluidframework.com/docs/api/fluid-framework/schemafactoryalpha-class).

> [!WARNING]
> These APIs are in preview and are subject to change.
> Until these APIs have stabilized, we do not recommend using them in production code.
> We reserve the right to make breaking changes to these APIs, including their persisted data format.
> Using these APIs in production code may result in data loss or corruption.

#### Creating a table with default column and row schema

You can craft a table with defaults via `TableSchema.createTable`, without specifying custom column or row schema.
Note that you will still be required to provide a schema for the cells that will appear in the table.

```typescript
class Cell extends schemaFactory.object("TableCell", {
	value: schemaFactory.string,
}) {}

class Table extends TableSchema.createTable({
	schemaFactory,
	cell: Cell,
}) {}

const table = new Table({
	columns: [{ id: "column-0" }],
	rows: [{ id: "row-0", cells: {} }],
});
```

#### Creating a table with custom column and row schema

If you need to associate additional data with your rows or columns, you can customize your row and column schema via `TableSchema.createColumn` and `TableSchema.createRow`.
These schema can then be provided to `TableSchema.createTable`:

```typescript
class Cell extends schemaFactory.object("TableCell", {
	value: schemaFactory.string,
}) {}

class ColumnProps extends schemaFactory.object("TableColumnProps", {
	// Column label to display.
	label: schemaFactory.string,
	// The type of data represented by the cells. Default: string.
	dataType: schemaFactory.optional(schemaFactory.string),
}) {}

class Column extends TableSchema.createColumn({
	schemaFactory,
	props: ColumnProps,
}) {}

class Row extends TableSchema.createRow({
	schemaFactory,
	cell: Cell,
}) {}

class Table extends TableSchema.createTable({
	schemaFactory,
	cell: Cell,
	column: Column,
	row: Row,
}) {}

const table = new Table({
	columns: [
		new Column({ props: { label: "Entry", dataType: "string" } }),
		new Column({ props: { label: "Date", dataType: "date" } }),
		new Column({ props: { label: "Amount", dataType: "number" } }),
	],
	rows: [],
});
```

#### Listening for changes

Listening for changes to table trees behaves just like it would for any other nodes in a Shared Tree.
The most straightforward option is to listen for any changes to the table node and its descendants.
For example:

```typescript
class Cell extends schemaFactory.object("TableCell", {
	value: schemaFactory.string,
}) {}

class Table extends TableSchema.createTable({
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

If you need more granular eventing, that is possible as well.
For example, if you wish to know when the table's list of rows changes, you could do the following:

```typescript
class Cell extends schemaFactory.object("TableCell", {
	value: schemaFactory.string,
}) {}

class Table extends TableSchema.createTable({
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

##### Orphaned Cells

Note: for now it is possible for table cells to become "orphaned".
That is, it is possible to enter a state where one or more rows contain cells with no corresponding column.
To help avoid this situation, you can manually remove corresponding cells when removing columns.
Either way, it is possible to enter such a state via the merging of edits.
For example: one client might add a row while another concurrently removes a column, orphaning the cell where the column and row intersected.
