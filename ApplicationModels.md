# Fluid Framework Application Models

> **Work in progress.** This document is a placeholder. Content describing the differences between the encapsulated and declarative application models will be added here.

## Overview

Fluid Framework supports two application models for hosting collaborative content:

### Declarative Model

Publicly supported model. The application uses a service client (e.g., `AzureClient`, `OdspClient`) to create or load containers, and supplies configuration at the service-client level via parameters such as `CompatibilityMode`. The declarative model targets a consistent Fluid Framework version across all layers (Driver, Loader, Runtime, Datastore).

For cross-client compatibility configuration in this model, see [Configuring Cross-Client Compatibility (Declarative Model)](./CrossClientCompatibility.md#configuring-cross-client-compatibility-declarative-model).

### Encapsulated Model

Falls under the `@legacy` API surface; **not supported for general use** unless coordinated with the Fluid Framework team. The application calls `loadContainerRuntime` directly to construct a container runtime and supplies configuration on `LoadContainerRuntimeParams`. The encapsulated model permits different layers to load at different versions, including dynamic loading of pieces at a range of versions — the application is responsible for ensuring those combinations are compatible.

For cross-client compatibility configuration in this model, see [Configuring Cross-Client Compatibility (Encapsulated Model)](./CrossClientCompatibility.md#configuring-cross-client-compatibility-encapsulated-model). For layer compatibility considerations, see [Layer Compatibility](./LayerCompatibility.md).
