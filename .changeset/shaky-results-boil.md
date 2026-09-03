---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": tree
---
Record node property reads now include undefined

Reading a property from a record node now returns `T | undefined`, matching the runtime behavior when the key is absent.
Consumers must narrow the result before using it as `T`.

```typescript
const value = record.foo;
if (value !== undefined) {
	// Use value as T.
}
```
