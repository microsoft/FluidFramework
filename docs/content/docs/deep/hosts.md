---
title: Hosts and the loader
menuPosition: 4
aliases:
  - "/docs/concepts/hosts"
draft: true
---

The **Fluid loader** is one of the key parts of the Fluid Framework. Developers use the Fluid loader within their
applications to load Fluid containers and to initiate communication with the Fluid service.

A **Fluid host** is any application that uses the Fluid loader to load a Fluid container.

The Fluid loader uses a plugin model.


## Who needs a Fluid loader?

If your app or website will load a Fluid container, then you are creating a Fluid host and you will need to use the
Fluid loader!

If you are building a Fluid container and you will not build a standalone application with Fluid, you may still be
interested in learning about the Fluid loader. The Fluid loader includes capabilities, such as host scopes, that are used
by containers.

You may also want to host your Fluid container on a standalone website.


## Summary

The Fluid loader loads Fluid containers by connecting to the Fluid service and fetching Fluid container code. From a
system architecture perspective, the Fluid loader sits in between the Fluid service and a Fluid container.

<img src="/images/architecture.png" alt="The Fluid architecture consists of a client and service. The
client contains the Fluid loader and the Fluid container. The Fluid loader contains a document service factory, code
loader, scopes, and a URL resolver. The Fluid runtime is encapsulated within a container, which is built using Fluid
objects and distributed data structures.">

The Fluid loader is intended to be extremely generic. To maintain generic-ness, the loader uses a plugin model. With the
right plugins (drivers, handlers, resolvers), the Fluid loader will work for any wire protocol and any service
implementation.

The loader mimics existing web protocols. Similar to how the browser requests state and app logic (a website) from a
web server, a Fluid host uses the loader to request a [Fluid container][] from the Fluid service.

## Fluid host responsibilities

A Fluid host creates a Fluid loader with a URL resolver, Fluid service driver, and code loader. The host then requests a
Fluid container from the loader. Finally, the host *does something* with the Fluid containers. A host can request
multiple containers from the loader.

<img src="/images/load-flow.png" alt="The Fluid loader connects to a URL using a container resolver, a
service driver, and a container code loader. It then returns a Fluid container or shared object.">

We'll talk about each of these parts, starting with the request and loader dependencies, over the next sections.

## Loading a container: class by class

Let's address the role of each part of the Fluid loader and dive in to some details.

### Request

The request includes a Fluid container URL and optional header information. This URL contains a protocol and other
information that will be parsed by the URL Resolver to identify where the container is located.

This is not part of instantiating the loader. The request kicks of the process of loading a container.

### URL resolver

The URL resolver parses a request and returns an `IFluidResolvedUrl`. This object includes all the endpoints and tokens
needed by the Fluid service driver to access the container.

An example `IFluidResolvedUrl` includes the below information.

```typescript
const resolvedUrl: IFluidResolvedUrl = {
    endpoints: {
        deltaStorageUrl: "www.ContosoFluidService.com/deltaStorage",
        ordererUrl: "www.ContosoFluidService.com/orderer",
        storageUrl: "www.ContosoFluidService.com/storage",
    },
    tokens: { jwt: "token" },
    type: "fluid",
    url: "fluid://www.ContosoFluidService.com/ContosoTenant/documentIdentifier",
}
```

You may notice we are mimicking the DNS and protocol lookup a browser performs when loading a webpage. That's because a
loader may access containers stored on multiple Fluid services. Furthermore, each Fluid service could be operating with
a different API and protocol.

### Fluid service driver factory (DocumentServiceFactory)

The loader uses a Fluid service driver to connect to a Fluid service.

While many developers will only load one container at a time, it's interesting to consider how the loader handles
loading two containers that are stored on different Fluid services. To keep track of the services, the loader uses the
protocol from the resolved URL to identify the correct Fluid service driver for the Fluid service.

### Code loader

The loader uses the code loader to fetch container code. Because a Fluid container is a app logic and distributed state
we need all of the connected clients to agree on the same container code.

### Scopes

Scopes allow the container access to resources from the host. For example, the host may have access to an authorization
context that the container code is not trusted to access. The host can provide a scope to the container that federates
access to the secure resource.

## Handling the response

The Fluid loader will return a response object from the request. This is a continuation of our web protocol metaphor,
you'll receive an object with a mimeType (e.g. "fluid/object"), response status (e.g. 200), and a value (e.g. the Fluid
object).

The host is responsible for checking that this response is valid. Did the loader return a 200? Is the mimeType correct?
As the Fluid Framework expands, we intend to make further use of these responses.

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
