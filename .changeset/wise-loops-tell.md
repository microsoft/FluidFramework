---
"fluid-framework": minor
"@fluidframework/tree": minor
"__section": tree
---
Users of alpha schema APIs can now add metadata to AllowedTypes

This change allows metadata to be added to [`AllowedTypes`](https://fluidframework.com/docs/api/fluid-framework/allowedtypes-typealias) as well as individual types in a set of `AllowedTypes`.
Users can define custom metadata by putting their `AllowedTypes` in an object with `metadata` and `types` properties:

```typescript
schemaFactoryAlpha.arrayAlpha({
	metadata: {
		custom: "these allowed types are annotated",
	},
	types: [SchemaFactory.string, SchemaFactory.number],
})
```

This annotation system will also be used to implement future schema features.
