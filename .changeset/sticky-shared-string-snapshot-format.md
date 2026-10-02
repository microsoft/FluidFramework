---
"@fluidframework/sequence": minor
"__section": feature
---
Keep SharedString's flat snapshot format after opting in

SharedString now remembers the snapshot format selected for each summary across loads.
An explicit setting takes precedence over the recorded setting, and SharedString uses the legacy format when neither setting exists.
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
When the flag is unset, the existing `newMergeTreeSnapshotFormat` runtime option takes precedence over the recorded setting.
If neither explicit setting is provided, SharedString reuses its recorded setting.
Flat summaries record the setting as `true`, and legacy summaries omit it.
An explicit `false` clears the remembered flat setting when the DDS is next summarized.
Changes to the setting do not force an otherwise unchanged DDS to produce a new summary.
