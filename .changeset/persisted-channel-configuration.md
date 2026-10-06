---
"@fluidframework/container-runtime": minor
"@fluidframework/datastore": minor
"@fluidframework/shared-object-base": minor
"__section": other
"__includeInReleaseNotes": false
---
Add opt-in persisted channel configuration infrastructure

Internal kernel factories can opt new and existing DDS instances into readonly JSON configuration stored with channel attributes.
Inheritance-based DDSes can use `initializeSharedObjectConfiguration` during construction to obtain the same facet.
The helper shares controller, lifecycle, and persistence behavior with kernel factories, including subclasses of `SharedObjectCore` with custom asynchronous summaries.
Supporting factories supply a stable `defaultConfiguration` for unmarked instances.
Reading these defaults does not change the summary; the first accepted replacement starts persistent configuration.
Fluid Framework code owns these values and must preserve their JSON round-trip behavior; the protocol does not deep-copy, freeze, or recursively validate them.
The internal configuration facet exposes read-only revision and values without an encoding version; only persisted attributes and configuration wire ops carry `version: 1`.
Unattached instances apply replacements locally; attached instances use sequenced compare-and-swap barriers.
`requestChangeLazy` defers an attached request until the same channel's next fresh ordinary op, submitting the control op afterward to preserve optimistic edit order.
It leaves idle channels unchanged and applies immediately while unattached.
Deferred intent is process-local until submitted, retains its original expected revision, and is not flushed by summaries, other channels, configuration ops, or replay.
Configuration ops use `{ version: 1, isChannelConfigurationOp: true, expectedRevision, values }`.
Ordinary DDS operations stay unwrapped and carry no configuration revision or provenance metadata.
Their existing processing and replay behavior is unchanged, including for ops authored before a configuration change.
The own top-level `isChannelConfigurationOp` property is reserved for configuration ops regardless of its value.
Ordinary submission, receive, stash, resubmit, and rollback reject it with `DataProcessingError`, even on unconfigured channels; nested application data can still use that name.
One sticky document-schema flag, `sharedObjectConfiguration`, requires support for the SharedObject configuration protocol.
The internal runtime option `enableSharedObjectConfiguration` requests this flag through normal schema upgrades.
Factory reader checks reject unsupported configured snapshots, and SharedObjects without a configuration definition reject configuration ops.
No production DDS persists configuration merely because it is loaded or created without explicit configuration.
This wire format replaces the earlier wrapped prototype without automatic migration or compatibility with its saved pending ops.
Normal stable unconfigured summaries remain readable.

Reader defaults are separate from optional initial configuration on new instances:

```typescript
const kind = makeSharedObjectKind({
    ...options,
    factory: {
        ...factory,
        configurationDefinition: {
            ...configurationDefinition,
            defaultConfiguration: { retainHistory: false },
        },
    },
});
// Inside factory.create or factory.loadCore:
const current = args.configuration?.current;
// In a later API call, after construction and once the document flag is active:
await args.configuration?.requestChange({ retainHistory: true });
```
