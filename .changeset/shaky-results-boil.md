---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": tree
---
Record node property reads now include undefined

Reading a property from a record node now returns `T | undefined` instead of `T`, matching the runtime behavior when the key is absent.
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
