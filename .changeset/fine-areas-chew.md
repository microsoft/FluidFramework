---
"@fluidframework/ordered-collection": minor
"__section": breaking
---
Remove deprecated ConsensusQueueClass export

The deprecated legacy beta export of `ConsensusQueueClass` has been removed:
Use the `ConsensusQueue` singleton (which implements `ISharedObjectKind<IConsensusOrderedCollection>`) instead.
The deprecated legacy beta export of the `ConsensusQueue` type now points to `IConsensusOrderedCollection`.
