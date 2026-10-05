---
"@fluidframework/container-runtime": minor
"@fluidframework/datastore": minor
"@fluidframework/shared-object-base": minor
"__section": other
"__includeInReleaseNotes": false
---
Add opt-in persisted channel configuration infrastructure

Internal kernel factories can opt new DDS instances into immutable JSON configuration stored with channel attributes.
The internal configuration facet exposes read-only revision and values without an encoding version; only persisted attributes and configuration wire ops carry `version: 1`.
Unattached instances apply replacements locally; attached instances use sequenced compare-and-swap barriers.
Configuration ops use `{ version: 1, isChannelConfigurationOp: true, expectedRevision, values }`.
Ordinary DDS operations stay unwrapped and carry no configuration revision or provenance metadata.
Their existing processing and replay behavior is unchanged, including for ops authored before a configuration change.
The own top-level `isChannelConfigurationOp` property is reserved for configuration ops regardless of its value.
Ordinary submission, receive, stash, resubmit, and rollback reject it with `DataProcessingError`, even on unconfigured channels; nested application data can still use that name.
The document capability and factory reader checks prevent unsupported readers from loading configured channels.
Existing DDS instances remain on the legacy protocol, and no production DDS opts in by default.
This wire format replaces the earlier wrapped prototype without automatic migration or compatibility with its saved pending ops.
Normal stable unconfigured summaries remain readable.

Reader support is separate from the initial configuration of new instances:

```typescript
const kind = makeSharedObjectKind({
    ...options,
    factory: { ...factory, configurationDefinition },
    initialConfiguration: { retainHistory: false },
});
// Inside factory.create or factory.loadCore:
const current = args.configuration?.current;
```
