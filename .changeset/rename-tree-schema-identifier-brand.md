---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": tree
---
Deprecated Tree APIs are removed for 3.0

The following deprecated APIs have been removed:

- The `IsListener`, `Listenable`, `Listeners`, and `Off` type aliases. Import [IsListener](https://fluidframework.com/docs/api/core-interfaces/islistener-typealias), [Listenable](https://fluidframework.com/docs/api/core-interfaces/listenable-interface), [Listeners](https://fluidframework.com/docs/api/core-interfaces/listeners-typealias), and [Off](https://fluidframework.com/docs/api/core-interfaces/off-typealias) from `@fluidframework/core-interfaces` or `fluid-framework` instead.
- `asTreeViewAlpha`. Use [asAlpha](https://fluidframework.com/docs/api/fluid-framework#asalpha-function) instead.
- `TreeAlpha.branch`. Use [TreeAlpha.context(node)](https://fluidframework.com/docs/api/fluid-framework/treealpha-interface#context-methodsignature) and call [isBranch()](https://fluidframework.com/docs/api/fluid-framework/treecontextalpha-interface#isbranch-methodsignature) on the returned context to narrow it to a branch.
- The `TableSchema.InsertColumnsParameters`, `TableSchema.InsertRowsParameters`, and `TableSchema.SetCellParameters` interfaces and the Table methods that accepted them. Use the positional [insertColumns](https://fluidframework.com/docs/api/fluid-framework/tableschema-namespace/table-interface#insertcolumns-methodsignature), [insertRows](https://fluidframework.com/docs/api/fluid-framework/tableschema-namespace/table-interface#insertrows-methodsignature), and [setCell](https://fluidframework.com/docs/api/fluid-framework/tableschema-namespace/table-interface#setcell-methodsignature) overloads instead.
- The `TableSchema.Table.removeCell(key)` overload. Pass the row and column as separate arguments to [removeCell](https://fluidframework.com/docs/api/fluid-framework/tableschema-namespace/table-interface#removecell-methodsignature) instead.

The deprecated `@system` `typeNameSymbol` API has been replaced by `schemaIdentifierBrand`, which remains `@system` but is not deprecated.
The brand is retained as a compile-time optimization that enables TypeScript to handle larger schema unions.
Neither symbol is available as a runtime export; they appear only in type declarations.
Most users do not need to refer to either symbol.
Code that explicitly referenced `typeNameSymbol` should reference `schemaIdentifierBrand`.
