---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": tree
---
TableSchema (beta) methods now accept positional arguments

The `insertColumns`, `insertRows`, `setCell`, and `removeCell` methods on `TableSchema.Table` now accept positional arguments in addition to the existing property-bag form.
The new overloads remove a layer of object construction at call sites and make the common cases more concise.

The existing property-bag overloads continue to work but are now deprecated.
They will be removed in a future release.

#### Migration

```typescript
// ...

// Before
table.insertColumns({ columns: [columnA, columnB] });
table.insertColumns({ index: 0, columns: [columnA] });
table.insertRows({ rows: [rowA, rowB] });
table.insertRows({ index: 0, rows: [rowA] });
table.setCell({ key: { column, row }, cell });
table.removeCell({ column, row });

// After
table.insertColumns([columnA, columnB]);
table.insertColumns([columnA], 0);
table.insertRows([rowA, rowB]);
table.insertRows([rowA], 0);
table.setCell(row, column, cell);
table.removeCell(row, column);
```
