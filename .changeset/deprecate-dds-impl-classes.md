---
"@fluidframework/register-collection": minor
"@fluidframework/ordered-collection": minor
"__section": deprecation
---

Deprecated DDS implementation classes

The following DDS implementation classes are now deprecated and will be removed in a future release:

- `ConsensusRegisterCollectionClass` — use `ConsensusRegisterCollectionFactory` to create instances and `IConsensusRegisterCollection` for typing
- `ConsensusOrderedCollection` — use `IConsensusOrderedCollection` for typing
- `ConsensusQueueClass` — use the `ConsensusQueue` singleton to create instances and `IConsensusOrderedCollection` for typing
