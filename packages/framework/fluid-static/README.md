# @fluidframework/fluid-static

The `fluid-static` package provides a simple and powerful way to consume collaborative Fluid data.

## Using fluid-static

The `fluid-static` package contains a container with a pre-created default data object with the ability to create and store additional objects. This is abstracted behind a developer-friendly `FluidContainer` interface that provides configurations for defining the container's initial object and supported dynamic object types, as well as callbacks for creating and fetching DDSes and data objects.

This is consumed by separate client packages, such as [TinyliciousClient](../tinylicious-client/README.MD) for the Tinylicious service, to provide an easy way of creating and fetching FluidContainer instances that are backed by data stored on the respective services.
