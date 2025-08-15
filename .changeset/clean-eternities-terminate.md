---
"@fluidframework/tree": minor
"__section": tree
---
TableSchema's "removeColumn" API now removes corresponding cells (alpha)

Previously, the [removeColumn](https://fluidframework.com/docs/api/fluid-framework/tableschema-namespace/table-interface#removecolumn-methodsignature) API on Table nodes derived from [TableSchema](https://fluidframework.com/docs/api/fluid-framework/tableschema-namespace/) (alpha) only removed the `Column` node from the list of columns tracked by the table.
To also remove the corresponding cells from the table (which are stored on the `Row` nodes), the user was required to write a custom transaction that removed the column and cells.

The motivation for this design was due to performance concerns with transactions.
Those concerns are still relevant, but the data leak risk of dropping columns without removing corresponding cells seems a greater risk, and we have plans to address the performance issues with transactions.
