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
Deprecate IFluidHandleInternal.bind function

Handle binding is an internal concept used to make sure objects attach to the Container graph when their handle is stored in a DDS which is itself attached.
The source of the "bind" operation has been assumed to be any handle, but only one (non-exported) implementation is actually supported (`SharedObjectHandle`).

So we are deprecating the `bind` function on the `IFluidHandleInterface`, and moving it to a internal types supporting the one valid implementation.
It's also deprecated on the various exported handle implementations that don't support it (they all were no-ops or threw).

No replacement is offered, this API was never meant to be called from outside of the Fluid Framework.
