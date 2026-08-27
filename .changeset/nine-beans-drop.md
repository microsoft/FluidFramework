---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": tree
---
Schema compatibility snapshots support custom filename prefixes and suffixes

`snapshotSchemaCompatibility` now accepts `snapshotFileNameFormat`, which can add a prefix and suffix around the version in generated snapshot filenames. The same format is used to discover historical snapshots, allowing multiple schema snapshot sets or unrelated JSON files to share a directory.

```typescript
snapshotSchemaCompatibility({
	// Existing options...
	snapshotFileNameFormat: {
		prefix: "point-schema-",
		suffix: "-snapshot",
	},
});
```
