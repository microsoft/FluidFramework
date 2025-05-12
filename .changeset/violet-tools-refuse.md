---
"@fluidframework/container-runtime": minor
"@fluidframework/core-interfaces": minor
"@fluidframework/datastore": minor
"@fluidframework/runtime-utils": minor
"@fluidframework/shared-object-base": minor
"@fluid-private/test-dds-utils": minor
"@fluid-private/test-end-to-end-tests": minor
"@fluidframework/test-runtime-utils": minor
"@fluid-experimental/tree": minor
"__section": deprecation
---
IFluidHandleInternal.bind has been deprecated

Handle binding is an internal concept used to make sure objects attach to the Container graph when their handle is stored in a DDS which is itself attached.
The source of the "bind" operation has been assumed to be any handle, but only one implementation is actually supported (`SharedObjectHandle`, not exported itself).

So the `bind` function is now deprecated on the `IFluidHandleInterface`, moving instead to internal types supporting the one valid implementation.
It's also deprecated on the various exported handle implementations that don't support it (each is either no-op, pass-through, or throwing).

No replacement is offered, this API was never meant to be called from outside of the Fluid Framework.
