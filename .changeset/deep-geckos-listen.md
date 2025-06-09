---
"@fluidframework/sequence": minor
"__section": deprecation
---
Deprecate unnecessary and internal APIs in `ISequenceIntervalCollection` and related interval types.

The following APIs are now deprecated and will be removed in a future release:
- `IInterval.clone`
- `IInterval.modify`
- `ISerializableInterval.serialize`
- `SequenceInterval.clone`
- `SequenceInterval.modify`
- `SequenceInterval.addPositionChangeListeners`
- `SequenceInterval.removePositionChangeListeners`


These APIs were never intended for public use. There is no migration path, and any usage is strongly discouraged, as it may result in severe errors or data corruption. Please remove any dependencies on these APIs as soon as possible.
