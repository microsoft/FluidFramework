---
"@fluidframework/ordered-collection": minor
"__section": legacy
---
Use the queue interface instead of its implementation classes

The package no longer exports `ConsensusQueueClass` or `ConsensusOrderedCollection`, so direct construction and inheritance from these implementation classes are no longer supported. Replace class annotations with `IConsensusOrderedCollection<T>` or the `ConsensusQueue<T>` type alias. Use the existing `ConsensusQueue` creation value instead of the implementation constructor.

```typescript
import {
	ConsensusQueue,
	type IConsensusOrderedCollection,
} from "@fluidframework/ordered-collection/legacy";

const queue: IConsensusOrderedCollection = ConsensusQueue.create(runtime);
const factory = ConsensusQueue.getFactory();
```

Collection interfaces, events, generic factories, handles, and persisted data formats remain unchanged. The existing collection deprecation still applies. See [issue #26691](https://github.com/microsoft/FluidFramework/issues/26691).
