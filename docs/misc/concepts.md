# Glossary

* This section will contain deeper information about the key concepts that developers should understand to be effective
  with Fluid.

## Components

A component is little more than a JavaScript object. What makes Fluid components special is the following:

* They are instantiated by the Fluid runtime
* They are opened/created via a unique URL
* The code executing inside the component is the current code package accepted by the container's Quorum
* They are per-client singletons (i.e., opening the same URL multiple times on the same client returns the same
  component instance)
* They encapsulate distributed data structures that automatically synchronize with component instances created via the
  same URL by other clients
* A component also has the capability to load other components, including components from other containers, provided
  that the user bears the appropriate token and has the necessary code loader

## Containers

A Container hosts a collection of Components. It is responsible for:

* Determining what code executes in hosted component (via quorum)
* Resolving URL paths to component instances

All components hosted within a container share:

* The same code packages
* The same total ordering
* The same auth requirements

This means that containers are the finest-grained versioning and security boundaries understood by the core runtime:

* The code executed by all components running in a container is updated together/atomically via the container
* A user with the capability to open a component within a container has the capability to open any component in the
  container (if they know the URL)

The granularity at which containers are used is up to the application, but using a container per document is often
natural.

In general, developers should not implement their own container, but should use the generic container included in the
SDK (with possible customizations to routing.)

The granularity at which components are used is up to the application, but there are two cases where an application is
required to use separate components:

1. Anything that can be independently hosted/reused must be a separate component. For example, TableDocument is a
   separate component to support multiple views of the same data (e.g., Chart, Tablero, etc.)
2. Anything that can be versioned independently must be a separate component. (e.g. extensibility points)
