---
"@fluidframework/aqueduct": major
---

aqueduct: Removed getDefaultObjectFromContainer, getObjectWithIdFromContainer and getObjectFromContainer

The `getDefaultObjectFromContainer`, `getObjectWithIdFromContainer` and `getObjectFromContainer` helper methods have been removed from @fluidframework/aqueduct. Please move all code usage to the new `entryPoint` pattern.

See
[Removing-IFluidRouter.md](https://github.com/microsoft/FluidFramework/blob/main/packages/common/core-interfaces/Removing-IFluidRouter.md)
for more details.
