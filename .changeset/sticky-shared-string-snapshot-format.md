---
"@fluidframework/sequence": minor
"fluid-framework": minor
"__section": feature
---
SharedString now allows applications to configure which snapshot format it uses

Use `configuredSharedString` to select a snapshot format through the registered DDS factory.
Set `newMergeTreeSnapshotFormat` to `true` for flat snapshots or `false` for legacy snapshots.
Both snapshot formats remain supported.

```typescript
import { configuredSharedString } from "@fluidframework/sequence/legacy";

const ConfiguredSharedString = configuredSharedString({
	newMergeTreeSnapshotFormat: true,
});
const factory = ConfiguredSharedString.getFactory();
```

Register this kind, or its factory, in place of the default SharedString.
The API is also available from `fluid-framework/legacy`.
Omit the factory option to allow the runtime option or loaded snapshot format to determine the format.

The existing configuration-provider flow remains supported:

```typescript
const configProvider = {
	getRawConfig(name: string): boolean | undefined {
		return name === "Fluid.Sequence.newMergeTreeSnapshotFormat" ? true : undefined;
	},
};
```

Return `false` for this flag to explicitly select legacy snapshots.
Selection precedence is the configuration flag, the factory option, the runtime option, then the loaded snapshot format.
When no explicit setting is provided, new SharedStrings use the legacy format and loaded SharedStrings reuse the format identified by their snapshot header.
A summary written in the selected format becomes the inherited format for clients that load it without an explicit setting.
Configuration and options are fixed for each DDS instance; use a new client or factory configuration to select a different format.
No additional DDS attributes are stored for the setting.
Format selection does not force an otherwise unchanged DDS to produce a new summary.
