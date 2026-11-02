---
"@fluidframework/register-collection": minor
"__section": legacy
---
Use the register collection interface instead of its implementation class

The package no longer exports `ConsensusRegisterCollectionClass`, so direct construction and inheritance from the implementation class are no longer supported. Replace class annotations with `IConsensusRegisterCollection` or the `ConsensusRegisterCollection` type alias. Use the existing `ConsensusRegisterCollection` creation value instead of the implementation constructor.

```typescript
import {
	ConsensusRegisterCollection,
	type IConsensusRegisterCollection,
} from "@fluidframework/register-collection/legacy";

const registers: IConsensusRegisterCollection = ConsensusRegisterCollection.create(runtime);
const factory = ConsensusRegisterCollection.getFactory();
```

Collection interfaces, events, factories, handles, and persisted data formats remain unchanged. The existing collection deprecation still applies. See [issue #26691](https://github.com/microsoft/FluidFramework/issues/26691).
