# Fluid Loader

This is about the "loader layer" of the Fluid Framework, not to be confused with the `Loader` class (which is part of this layer).

The `loader` layer contains code which gets directly included into Fluid applications.
This layer is kept minimal to reduce the need to update the application when the Fluid Framework changes,
as well as keep the size application small.
Instead most of the code is placed in either the `runtime` or `driver` layers and dynamically loaded by the `loader`.

The loading is initiated by loading a container, which involves the appropriate drivers and runtime for the container.
See [@FluidFramework/container-loader package README](container-loader/README.md) for details.
Once the container is loaded, code from the loader layer (but not Loader class) is still involved since it handles passing the ops between the runtime and the driver in both directions.
