---
title: Packages
menuPosition: 7
author: tylerbutler
---

The Fluid Framework is a multi-layered system consisting of dozens of individual npm packages. Most developers will only
need two or three of these packages for typical Fluid development: The `fluid-framework` package, which contains the
public API for the Fluid Framework, and a service-specific client package, such as the
`@fluidframework/tinylicious-client` package.

## Primary API: fluid-framework

The `fluid-framework` package bundles a collection of Fluid Framework client packages for easy use when paired with a
corresponding service client package, such as the `@fluidframework/azure-client` package. The `fluid-framework` package
consists primarily of two portions: the `IFluidContainer` interface and a selection of distributed data structures
(DDSes).

### IFluidContainer

The [IFluidContainer][] interface is the one of
the types returned by calls to `createContainer()` and `getContainer()` on the service clients such as `AzureClient`. It
includes functionality to retrieve the Fluid data contained within a container, as well as to inspect the state of the
collaboration session connection.

### DDS packages

You'll use one or more DDSes in your container to model your collaborative data.  The `fluid-framework` package includes
three data structures that cover a broad range of scenarios:

1. [SharedMap][], a map-like data structure for storing key/value pair data.
2. [SharedDirectory][], a map-like data structure with ability to organize keys into subdirectories.
3. [SharedString][], a data structure for string data.

## Package scopes

Fluid Framework packages are published under one of the following npm scopes:

- @fluidframework
- @fluid-experimental
- @fluid-internal
- @fluid-tools

Unless you are contributing to the Fluid Framework, you should only need packages from the **@fluidframework** scope.
You can [read more about the scopes and their intent][scopes] in the Fluid Framework wiki.

[scopes]: https://github.com/microsoft/FluidFramework/wiki/npm-package-scopes

<!-- AUTO-GENERATED-CONTENT:START (INCLUDE:path=docs/_includes/links.md) -->
<!-- Links -->

<!-- Concepts -->

[Fluid container]: {{< relref "containers.md" >}}

<!-- Classes and interfaces -->

[ContainerRuntimeFactoryWithDefaultDataStore]: {{< relref "containerruntimefactorywithdefaultdatastore.md" >}}
[DataObject]: {{< relref "dataobject.md" >}}
[DataObjectFactory]: {{< relref "dataobjectfactory.md" >}}
[IFluidContainer]: {{< relref "ifluidcontainer.md" >}}
[PureDataObject]: {{< relref "puredataobject.md" >}}
[PureDataObjectFactory]: {{< relref "puredataobjectfactory.md" >}}
[SharedCounter]: {{< relref "/docs/data-structures/counter.md" >}}
[SharedMap]: {{< relref "/docs/data-structures/map.md" >}}
[SharedNumberSequence]: {{< relref "sequences.md#sharedobjectsequence-and-sharednumbersequence" >}}
[SharedObjectSequence]: {{< relref "sequences.md#sharedobjectsequence-and-sharednumbersequence" >}}
[SharedSequence]: {{< relref "sequences.md" >}}
[SharedString]: {{< relref "string.md" >}}
[TaskManager]: {{< relref "/docs/data-structures/task-manager.md" >}}

<!-- AUTO-GENERATED-CONTENT:END -->
