---
"@fluidframework/container-runtime": minor
"@fluidframework/datastore": minor
"@fluidframework/shared-object-base": minor
"__section": other
"__includeInReleaseNotes": false
---
Add opt-in persisted channel configuration infrastructure

Internal kernel factories can opt new DDS instances into immutable JSON configuration stored with channel attributes.
Unattached instances apply replacements locally; attached instances use sequenced compare-and-swap barriers.
Ordinary DDS operations retain their existing behavior and expose their original configuration revision during processing.
The document capability and factory reader checks prevent unsupported readers from loading configured channels.
Existing DDS instances remain on the legacy protocol, and no production DDS opts in by default.

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
