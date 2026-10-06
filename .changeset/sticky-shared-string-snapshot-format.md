---
"@fluidframework/sequence": minor
"__section": feature
---
Keep SharedString's flat snapshot format after opting in

SharedString now reuses the format of its loaded or most recently generated summary when no explicit setting is provided.
An explicit setting takes precedence over that format, and new SharedStrings use the legacy format by default.
Both snapshot formats remain supported.

To opt in to flat snapshots, provide the following flag through your configuration provider:

```typescript
const configProvider = {
	getRawConfig(name: string): boolean | undefined {
		return name === "Fluid.Sequence.newMergeTreeSnapshotFormat" ? true : undefined;
	},
};
```

Return `false` for this flag to explicitly select legacy snapshots.
When the flag is unset, the existing `newMergeTreeSnapshotFormat` runtime option takes precedence over the remembered format.
If neither explicit setting is provided, SharedString reuses the format identified by the summary header.
Each generated summary becomes the default format for subsequent summaries, including after an explicit override is removed.
No additional DDS attributes are stored for the setting.
Changes to the setting do not force an otherwise unchanged DDS to produce a new summary.
