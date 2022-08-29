# @fluidframework/container-definitions

This package contains the interfaces and types concerning the Loader and loading the Container.

Some important interfaces in here include:

* **ILoader, IContainer** - Interfaces allowing the Host to load and interact with a Container
* **IContainerContext** - Proxy between the Host and the running instance of a Container,
which allows the code supporting the running Container to be swapped out during a session.
* **IRuntime / IRuntimeFactory** - Contract necessary for the ContainerContext to "boot" a Container at runtime.
* **IDeltaManager / IDeltaQueue** - Abstraction over the Container's view of the ops being transmitted to/from storage.
