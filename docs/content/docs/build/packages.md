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

The `fluid-framework` package consists primarily of two portions: the [FluidContainer][] object and a selection of
distributed data structures (DDSes).

### FluidContainer

The [FluidContainer][] object is the one of the object types returned by calls to `createContainer()` and
`getContainer()` on the service clients such as [AzureClient][]. It includes functionality to retrieve the Fluid data
contained within itself, as well as to inspect the state of the collaboration session connection.

### Shared object packages

You'll use one or more shared objects in your container to model your collaborative data. The `fluid-framework` package includes
three data structures that cover a broad range of scenarios:

1. [SharedMap]({{< relref "/docs/data-structures/map.md" >}}), a map-like data structure for storing key/value pair data.
2. [SharedDirectory]({{< relref "shareddirectory-class.md" >}}), a map-like data structure with ability to organize keys into subdirectories.
3. [SharedString]({{< relref "string.md" >}}), a data structure for string data.

## Package scopes

Fluid Framework packages are published under one of the following npm scopes:

- @fluidframework
- @fluid-experimental
- @fluid-internal
- @fluid-tools

In addition to the scoped packages, two unscoped packages are published: the [fluid-framework[] package, described earlier, and the `tinylicious` package, which contains a minimal Fluid server. For more information, see [Tinylicious]({{< relref "tinylicious.md" >}}).

Unless you are contributing to the Fluid Framework, you should only need the unscoped packages and packages from the **@fluidframework** scope.
You can [read more about the scopes and their intent][scopes] in the Fluid Framework wiki.

[scopes]: https://github.com/microsoft/FluidFramework/wiki/npm-package-scopes

<!-- AUTO-GENERATED-CONTENT:START (INCLUDE:path=docs/_includes/links.md) -->
<!-- Links -->

<!-- Concepts -->

[Fluid container]: {{< relref "containers.md" >}}

<!-- Distributed Data Structures -->

[SharedCounter]: {{< relref "/docs/data-structures/counter.md" >}}
[SharedMap]: {{< relref "/docs/data-structures/map.md" >}}
[SharedSequence]: {{< relref "/docs/data-structures/sequences.md" >}}
[SharedString]: {{< relref "/docs/data-structures/string.md" >}}

<!-- API links -->

[fluid-framework]: {{< relref "/docs/apis/fluid-framework.md" >}}
[@fluidframework/azure-client]: {{< relref "/docs/apis/azure-client.md" >}}
[@fluidframework/tinylicious-client]: {{< relref "/docs/apis/tinylicious-client.md" >}}

[AzureClient]: {{< relref "/docs/apis/azure-client/AzureClient-class.md" >}}
[TinyliciousClient]: {{< relref "/docs/apis/tinylicious-client/TinyliciousClient-class.md" >}}

[FluidContainer]: {{< relref "/docs/apis/fluid-static/fluidcontainer-class.md" >}}
[IFluidContainer]: {{< relref "/docs/apis/fluid-static/ifluidcontainer-interface.md" >}}

<!-- AUTO-GENERATED-CONTENT:END -->
