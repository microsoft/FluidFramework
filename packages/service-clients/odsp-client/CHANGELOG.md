# @fluid-experimental/odsp-client

## 2.12.0

### Minor Changes

-   New APIs to create and load containers without using the Loader object ([#22902](https://github.com/microsoft/FluidFramework/pull/22902)) [51a17289c6](https://github.com/microsoft/FluidFramework/commit/51a17289c683ff6666e496878cb6660d21759b16)

    #### Overview

    Provide standalone APIs to create and load containers instead of using the Loader object to do so. Earlier hosts were
    supposed to create the Loader object first and then call methods on it to create and load containers. Now they can just
    utilize these APIs directly and get rid of the Loader object.

    ##### Use `createDetachedContainer` to create a detached container

    ```typescript
    export async function createDetachedContainer(
    	createDetachedContainerProps: ICreateDetachedContainerProps,
    ): Promise<IContainer> {}
    ```

    `ICreateDetachedContainerProps` are the properties that needs to be supplied to the above API which contains props like
    URL Resolver, IDocumentServiceFactory, etc., which were previously used to create the `Loader` object.

    ##### Use `loadExistingContainer` to load an existing container

    ```typescript
    export async function loadExistingContainer(
    	loadExistingContainerProps: ILoadExistingContainerProps,
    ): Promise<IContainer> {}
    ```

    `ILoadExistingContainerProps` are the properties that needs to be supplied to the above API which contains props like
    URL Resolver, IDocumentServiceFactory, etc., which were earlier used to create the `Loader` object.

    ##### Use `rehydrateDetachedContainer` to create a detached container from a serializedState of another container

    ```typescript
    export async function rehydrateDetachedContainer(
    	rehydrateDetachedContainerProps: IRehydrateDetachedContainerProps,
    ): Promise<IContainer> {}
    ```

    `IRehydrateDetachedContainerProps` are the properties that needs to be supplied to the above API which contains props like
    URL Resolver, IDocumentServiceFactory, etc., which were earlier used to create the `Loader` object.

    ##### Note on `ICreateAndLoadContainerProps`.

    The props which were used to create the `Loader` object are now moved to the `ICreateAndLoadContainerProps` interface.
    `ICreateDetachedContainerProps`, `ILoadExistingContainerProps` and `IRehydrateDetachedContainerProps` which extends
    `ICreateAndLoadContainerProps` also contains some additional props which will be used to create and load containers like
    `IFluidCodeDetails`, `IRequest`, etc. Previously these were directly passed when calling APIs like
    `Loader.createDetachedContainer`, `Loader.resolve` and `Loader.rehydrateDetachedContainerFromSnapshot` on the `Loader`
    object. Also, `ILoaderProps.ILoaderOptions` are not replaced with `ICreateAndLoadContainerProps.IContainerPolicies`
    since there will be no concept of `Loader`.

## 2.11.0

Dependency updates only.

## 2.10.0

Dependency updates only.

## 2.5.0

Dependency updates only.

## 2.4.0

Dependency updates only.

## 2.3.0

Dependency updates only.

## 2.2.0

Dependency updates only.

## 2.1.0

Dependency updates only.

## 2.0.0-rc.5.0.0

### Minor Changes

-   odsp-client: Move odsp-client out of experimental ([#21024](https://github.com/microsoft/FluidFramework/pull/21024)) [8461a406f3](https://github.com/microsoft/FluidFramework/commit/8461a406f3086ced7e38a19f70d71cca72667333)

    The scope of the odsp-client package is changed from `@fluid-experimental/odsp-client` to `@fluidframework/odsp-client`.

-   Update to TypeScript 5.4 ([#21214](https://github.com/microsoft/FluidFramework/pull/21214)) [0e6256c722](https://github.com/microsoft/FluidFramework/commit/0e6256c722d8bf024f4325bf02547daeeb18bfa6)

    Update package implementations to use TypeScript 5.4.5.

## 2.0.0-rc.4.0.0

### Minor Changes

-   Rename `AzureMember.userName` to `AzureMember.name` and `IMember.userId` to `IMember.id` [96872186d0](https://github.com/microsoft/FluidFramework/commit/96872186d0d0f245c1fece7d19b3743e501679b6)

    1. Renamed `AzureMember.userName` to `AzureMember.name` to establish uniform naming across odsp-client and azure-client.
    2. Renamed `IMember.userId` to `IMember.id` to align with the properties received from AFR.

## 2.0.0-rc.3.0.0

### Major Changes

-   Packages now use package.json "exports" and require modern module resolution [97d68aa06b](https://github.com/microsoft/FluidFramework/commit/97d68aa06bd5c022ecb026655814aea222a062ae)

    Fluid Framework packages have been updated to use the [package.json "exports"
    field](https://nodejs.org/docs/latest-v18.x/api/packages.html#exports) to define explicit entry points for both
    TypeScript types and implementation code.

    This means that using Fluid Framework packages require the following TypeScript settings in tsconfig.json:

    -   `"moduleResolution": "Node16"` with `"module": "Node16"`
    -   `"moduleResolution": "Bundler"` with `"module": "ESNext"`

    We recommend using Node16/Node16 unless absolutely necessary. That will produce transpiled JavaScript that is suitable
    for use with modern versions of Node.js _and_ Bundlers.
    [See the TypeScript documentation](https://www.typescriptlang.org/tsconfig#moduleResolution) for more information
    regarding the module and moduleResolution options.

    **Node10 moduleResolution is not supported; it does not support Fluid Framework's API structuring pattern that is used
    to distinguish stable APIs from those that are in development.**

## 2.0.0-rc.2.0.0

Dependency updates only.

## 2.0.0-rc.1.0.0

### Minor Changes

-   Updated server dependencies ([#19122](https://github.com/microsoft/FluidFramework/issues/19122)) [25366b4229](https://github.com/microsoft/FluidFramework/commits/25366b422918cb43685c5f328b50450749592902)

    The following Fluid server dependencies have been updated to the latest version, 3.0.0. [See the full changelog.](https://github.com/microsoft/FluidFramework/releases/tag/server_v3.0.0)

    -   @fluidframework/gitresources
    -   @fluidframework/server-kafka-orderer
    -   @fluidframework/server-lambdas
    -   @fluidframework/server-lambdas-driver
    -   @fluidframework/server-local-server
    -   @fluidframework/server-memory-orderer
    -   @fluidframework/protocol-base
    -   @fluidframework/server-routerlicious
    -   @fluidframework/server-routerlicious-base
    -   @fluidframework/server-services
    -   @fluidframework/server-services-client
    -   @fluidframework/server-services-core
    -   @fluidframework/server-services-ordering-kafkanode
    -   @fluidframework/server-services-ordering-rdkafka
    -   @fluidframework/server-services-ordering-zookeeper
    -   @fluidframework/server-services-shared
    -   @fluidframework/server-services-telemetry
    -   @fluidframework/server-services-utils
    -   @fluidframework/server-test-utils
    -   tinylicious

-   Updated @fluidframework/protocol-definitions ([#19122](https://github.com/microsoft/FluidFramework/issues/19122)) [25366b4229](https://github.com/microsoft/FluidFramework/commits/25366b422918cb43685c5f328b50450749592902)

    The @fluidframework/protocol-definitions dependency has been upgraded to v3.1.0. [See the full
    changelog.](https://github.com/microsoft/FluidFramework/blob/main/common/lib/protocol-definitions/CHANGELOG.md#310)

## 2.0.0-internal.8.0.0

Dependency updates only.

## 2.0.0-internal.7.4.0

Dependency updates only.

## 2.0.0-internal.7.3.0
