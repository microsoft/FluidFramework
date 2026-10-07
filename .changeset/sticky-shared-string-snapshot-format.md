---
"@fluidframework/sequence": minor
"fluid-framework": minor
"__section": feature
---
Keep SharedString's flat snapshot format after opting in

SharedString now reuses the format of its loaded or most recently generated summary when no explicit setting is provided.
Explicit settings take precedence over that format, and new SharedStrings use the legacy format by default.
Both snapshot formats remain supported.

Use `configuredSharedString` to select a format through the registered DDS factory:

```typescript
import { configuredSharedString } from "@fluidframework/sequence/legacy";

const ConfiguredSharedString = configuredSharedString({
	newMergeTreeSnapshotFormat: true,
});
const factory = ConfiguredSharedString.getFactory();
```

Register this kind, or its factory, in place of the default SharedString.
The API is also available from `fluid-framework/legacy`.
Pass `false` to select legacy summaries, or omit the option to inherit the loaded or most recently generated format.

The existing configuration-provider flow remains supported:

```typescript
const configProvider = {
	getRawConfig(name: string): boolean | undefined {
		return name === "Fluid.Sequence.newMergeTreeSnapshotFormat" ? true : undefined;
	},
};
```

Return `false` for this flag to explicitly select legacy snapshots.
Selection precedence is the configuration flag, the factory option, the runtime option, then the remembered format.
If no explicit setting is provided, SharedString reuses the format identified by the summary header.
Each generated summary becomes the default format for subsequent summaries, including after an explicit override is removed.
No additional DDS attributes are stored for the setting.
Changes to the setting do not force an otherwise unchanged DDS to produce a new summary.
