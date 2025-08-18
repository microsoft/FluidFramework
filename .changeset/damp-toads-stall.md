---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": tree
---
Single-node insertion/removal APIs have been removed from TableSchema (alpha)

There is a significant performance benefit to inserting / removing rows / columns in batches.
To help encourage more performant usage patterns, single-node insertion and removal APIs.
The APIs that operate on batches should be used instead.

Specifically:

- `insertColumn`
	- Use `insertColumns` instead
- `insertRow`
	- Use `insertRows` instead
- `removeColumn`
	- Use `removeColumns` instead
- `removeRow`
	- Use `removeRows` instead
