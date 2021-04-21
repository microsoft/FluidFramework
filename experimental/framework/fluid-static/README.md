# @fluid-experimental/fluid-static

The fluid-static package provides a simple and powerful way to consume collaborative Fluid data.

This package is marked as experimental and currently under development. The API surface is currently under going drastic braking changes with no guarantees on compatibility.

## Using fluid-static

The fluid-static package gives a container with a pre-created default data object that is abstracted behind a developer-friendly FluidContainer interface. It provides configurations for defining the container's initial object and supported dynamic object types, and callbacks for fetching and creating DDS' and data objects.

This is consumed by separate client packages for each backing services, such as [TinyliciousClient](../tinylicious-client/README.MD) for the Tinylicious service, to provide an easy way of creating and fetching FluidContainer instances that are backed by data stored on the respective services.