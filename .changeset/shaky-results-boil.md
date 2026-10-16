---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": fix
---
Record node property read types now include undefined

Reading a property from a record node is now typed as `T | undefined` instead of `T`, matching the existing runtime behavior when the key is absent.
Consumers must narrow the result before using it as `T`.

```typescript
const value = record.foo;
if (value !== undefined) {
	// Use value as T.
}
```

This is a bug fix to the `@beta` record node APIs: the previous typing incorrectly claimed that reading any key would produce a value, which could result in unexpected `undefined` values at runtime.

Note that this does not change what a record node can store; entries are still always defined.
Assigning `undefined` to a key continues to remove that entry, as before.
