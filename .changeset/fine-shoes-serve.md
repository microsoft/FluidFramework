---
"@fluidframework/register-collection": minor
"__section": legacy
---
Use the register collection interface instead of its implementation class

To keep applications independent of implementation details, the package no longer exports `ConsensusRegisterCollectionClass`.
As a result, applications can no longer construct or subclass that class directly.

For instance annotations, use [`IConsensusRegisterCollection`](https://fluidframework.com/docs/api/register-collection/iconsensusregistercollection-interface) or the [`ConsensusRegisterCollection`](https://fluidframework.com/docs/api/register-collection/consensusregistercollection-typealias) type alias.
To create a collection, use the existing [`ConsensusRegisterCollection`](https://fluidframework.com/docs/api/register-collection/#consensusregistercollection-variable) creation value instead of the implementation constructor, as shown below.

```typescript
import {
	ConsensusRegisterCollection,
	type IConsensusRegisterCollection,
} from "@fluidframework/register-collection/legacy";

const registers: IConsensusRegisterCollection = ConsensusRegisterCollection.create(runtime);
const factory = ConsensusRegisterCollection.getFactory();
```

These replacements leave collection interfaces, events, factories, handles, and persisted data formats unchanged.
For the removal plan and existing deprecation, see [issue #26691](https://github.com/microsoft/FluidFramework/issues/26691).
