---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": tree
---
Deprecated Tree APIs are removed for 3.0

The following deprecated APIs have been removed:

- The `IsListener`, `Listenable`, `Listeners`, and `Off` type aliases. Import these types from `@fluidframework/core-interfaces` or `fluid-framework` instead.
- `asTreeViewAlpha`. Use `asAlpha` instead.
- `TreeAlpha.branch`. Use `TreeAlpha.context(node)` and call `isBranch()` on the returned context to narrow it to a branch.
- The `TableSchema.InsertColumnsParameters`, `TableSchema.InsertRowsParameters`, and `TableSchema.SetCellParameters` interfaces and the Table methods that accepted them. Use the corresponding positional overloads instead.
- The `TableSchema.Table.removeCell(key)` overload. Pass the row and column as separate arguments instead.

The deprecated `@system` `typeNameSymbol` API has been replaced by `schemaIdentifierBrand`, which remains `@system` but is not deprecated.
The brand is retained as a compile-time optimization that enables TypeScript to handle larger schema unions.
Neither symbol is available as a runtime export; they appear only in type declarations.
Most users do not need to refer to either symbol.
Code that explicitly referenced `typeNameSymbol` should reference `schemaIdentifierBrand` instead.
