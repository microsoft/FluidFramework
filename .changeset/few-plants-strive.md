---
"@fluidframework/devtools-core": minor
"__section": feature
---
Promote core devtools APIs from alpha to beta

The primary devtools APIs may now be imported from `/beta`. This includes:

- **`initializeDevtools`** - Initialize the devtools singleton
- **`tryGetFluidDevtools`** - Get the existing devtools instance if initialized
- **`IFluidDevtools`** - Main devtools interface for registering containers
- **`ContainerDevtoolsProps`** - Properties for registering containers with devtools

For example:

```typescript
import {
  initializeDevtools,
  tryGetFluidDevtools,
  type IFluidDevtools,
  type ContainerDevtoolsProps
} from "@fluidframework/devtools-core/beta";

// Initialize devtools
const devtools = initializeDevtools();

// Register a container
devtools.registerContainerDevtools({
  containerKey: "my-container",
  container: myContainer
});
```
