---
"fluid-framework": minor
"@fluidframework/tree": minor
"__section": tree
---
TableSchema (alpha) APIs have been added

Users may now represent dynamic, tabular data using Shared Tree.
New APIs have been added under a `TableSchema` namespace for creating column, row, and table node schema.

Note: these APIs require the use of [SchemaFactoryAlpha](https://fluidframework.com/docs/api/fluid-framework/schemafactoryalpha-class).

#### Creating a Table with Default Column and Row Schema

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

#### Creating a Table with Custom Column and Row Schema

If you need to associate additional data with your rows and columns, you can customize your schema via `TableSchema.createColumn` and `TableSchema.createRow`.
These schema can then be provided to `TableSchema.createTable`.

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

- TODO: easiest option: listen for changes at the root of the table.
- TODO: more granular option: listen for changes
- TODO: note about listening for events on cells

#### Limitations

- TODO: constraining cell by column
- TODO: orphaned cells
