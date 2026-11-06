---
"@fluidframework/sea-driver": minor
"@fluidframework/sea-tree": minor
"__section": feature
"__includeInReleaseNotes": false
---
Reuse unchanged content in direct SEA SharedTree summaries

Direct SharedTree hosts can use schema-selected incremental encoding to upload only changed chunks and their ancestor directories.
The host restores chunk tracking on load and resolves references against a confirmed summary, independently of the current publication parent.
Failed publications do not advance that baseline.
Version 2 full snapshots remain readable and migrate on their next summary; all clients must be updated before loading new version 3 snapshots.

Pass the existing schema policy helper in the sixth argument to `DirectSharedTreeClient.create`:

```typescript
{
	shouldEncodeIncrementally: incrementalEncodingPolicyForAllowedTypes(configuration),
}
```

The helper comes from `@fluidframework/tree/alpha` and uses the schema's `incrementalSummaryHint` annotations.
These SEA APIs remain internal and experimental.
