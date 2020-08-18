---
title: Hosts and the Loader
menuPosition: 4
---

The **Fluid Loader** is one of the key parts of the Fluid Framework. Developers use the Fluid Loader within their applications to load Fluid Containers and to initiate communication with the Fluid Service.

A **Fluid Host** is any application that uses the Fluid Loader to load a Fluid Container.

The Fluid Loader uses a plugin model.


## Who needs a Fluid Loader?

If your app or website will load a Fluid Container, then you are creating a Fluid Host and you will need to use the Fluid Loader!

If you are building a Fluid Container and you will not build a standalone application with Fluid, you may still be interested in learning about the Fluid Loader. The Fluid Loader includes capabilities, such as Host Scopes, that are used by Containers.

You may also want to host your Fluid Container on a standalone website.


## Summary

The Fluid Loader loads Fluid Containers by connecting to the Fluid Service and fetching Fluid Container code. From a system architecture perspective, the Fluid Loader sits in between the Fluid Service and a Fluid Container. 

![A diagram of the Fluid Framework system architecture](/docs/concepts/architecture.png)

The Fluid Loader is intended to be extremely generic. To maintain generic-ness, the Loader uses a plugin model. With the right plugins (drivers, handlers, resolvers), the Fluid Loader will work for any wire protocol and any service implementation. 

The Loader mimicks existing web protocols. Similar to how the browser requests state and app logic (a website) from a web server, a Fluid Host uses the loader to request a [Fluid Container](./containers-runtime.md) from the Fluid Service.

## Host Responsibilities
A Fluid Host creates a Fluid Loader with a URL Resolver, Fluid Service Driver, and Code Loader. The Host then requests a Fluid Container from the Loader. Finally, the Host *does something* with the Fluid Containers. A Host can request multiple containers from the Loader.

![The Loader architecture and request flow](/docs/concepts/load-flow.png)

We'll talk about each of these parts, starting with the request and Loader dependencies, over the next sections.

## Loading a Container - Class by Class
Let's address the role of each part of the Fluid Loader and dive in to some details.

### Request
The request includes a Fluid Container URL and optional header information. This URL contains a protocol and other information that will be parsed by the URL Resolver to identify where the Container is located.

This is not part of instantiating the Loader. The request kicks of the process of loading a Container.

### URL Resolver
The URL Resolver parses a request and returns an `IFluidResolvedUrl`. This object includes all the endpoints and tokens needed by the Fluid Service Driver to access the Container.

An example IFluidResolvedUrl includes the below information.

```typescript
const resolvedUrl: IFluidResolvedUrl = {
    endpoints: {
        deltaStorageUrl: "www.ContosoFluidService.com/deltaStorage",
        ordererUrl: "www.ContosoFluidService.com/orderer"
        storageUrl: "www.ContosoFluidService.com/storage",
    },
    tokens: { jwt: "token" },
    type: "fluid",
    url: "fluid://www.ContosoFluidService.com/ContosoTenant/documentIdentifier",
}
```

You may notice we are mimicking the DNS and protocol lookup a browser performs when loading a webpage. That's because a loader may access containers stored on multiple Fluid Services. Furthermore, each Fluid Service could be operating with a different API and protocol.

### Fluid Service Driver (DocumentServiceFactory)

The Loader uses a Fluid Service Driver to connect to a Fluid Service.

While many developers will only load one Container at a time, it's interesting to consider how the Loader handles loading two containers that are stored on different Fluid Services. To keep track of the services, the Loader uses the protocol from the ResolvedURL to identify the correct Fluid Service Driver for the Fluid Service.

### Code Loader

The Loader uses the Code Loader to fetch Container code. Because a Fluid Container is a app logic and distributed state we need all of the connected clients to agree on the same Container Code.

### Scopes

Scopes allow the Container access to resources from the Host. For example, the Host may have access to an authorization context that the Container code is not trusted to access. The Host can provide a Scope to the Container that federates access to the secure resource.

## Handling the Response

The Fluid Loader will return a response object from the request. This is a continuation of our web protocol metaphor, you'll receive an object with a mimeType (e.g. "fluid/object"), response status (e.g. 200), and a value (e.g. the fluid object).

The Host is responsible for checking that this response is valid. Did the loader return a 200? Is the mimeType correct? As the Fluid Framework expands, we intend to make further use of these responses.

The Host can then use Feature Detection via [IFluidObject](./feature-detection-iprovide.md) to query for features and then integrate the Container into the application
