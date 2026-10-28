---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": tree
---
Alpha views preserve beta and context transaction call shapes

Alpha tree views now support the single-value-type and generic callback-return-type overloads of `runTransaction` and `runTransactionAsync` available on beta views.
Calls with a single explicit value type also remain valid after narrowing an alpha context with `isView()`.
Synchronous callbacks can return incidental values, such as an array's new length, without requiring a wrapper that discards the return value.
Value-returning callbacks also retain beta-compatible typing when additional properties, such as `rollback`, have wider types.
Existing alpha overloads with separate success and failure value types remain supported.
Callbacks with union return types can now expose their returned values in the inferred result type instead of falling back to a result without a value.
Transaction runtime behavior is unchanged.
