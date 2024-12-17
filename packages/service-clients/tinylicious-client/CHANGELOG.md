# @fluidframework/tinylicious-client

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

### Minor Changes

-   tinylicious-client: Promote APIs from beta to public ([#21830](https://github.com/microsoft/FluidFramework/pull/21830)) [5336fd9f98](https://github.com/microsoft/FluidFramework/commit/5336fd9f984f5f904d426936f80ba2972945023b)

    Some tinylicious-client APIs were marked beta in previous releases. These APIs are now correctly marked public and also
    sealed to indicate they are not to be implemented externally to Fluid Framework and not changed.

    Updated APIs:

    -   [ITinyliciousAudience](https://fluidframework.com/docs/api/v2/tinylicious-client/itinyliciousaudience-typealias) sealed
    -   [TinyliciousClient](https://fluidframework.com/docs/api/v2/tinylicious-client/tinyliciousclient-class) sealed
    -   [TinyliciousClientProps](https://fluidframework.com/docs/api/v2/tinylicious-client/tinyliciousclientprops-interface) sealed
    -   [TinyliciousConnectionConfig](https://fluidframework.com/docs/api/v2/tinylicious-client/tinyliciousconnectionconfig-interface) sealed
    -   [TinyliciousContainerServices](https://fluidframework.com/docs/api/v2/tinylicious-client/tinyliciouscontainerservices-interface) sealed
    -   [TinyliciousMember](https://fluidframework.com/docs/api/v2/tinylicious-client/tinyliciousmember-interface) sealed
    -   [TinyliciousUser](https://fluidframework.com/docs/api/v2/tinylicious-client/tinylicioususer-interface) sealed

## 2.0.0-rc.5.0.0

### Minor Changes

-   Updated server dependencies ([#21514](https://github.com/microsoft/FluidFramework/pull/21514)) [9629f1d93a](https://github.com/microsoft/FluidFramework/commit/9629f1d93a7e412c0cb2f65cc21da0c95ff8981d)

    The following Fluid server dependencies have been updated to the latest version, 5.0.0. [See the full changelog.](https://github.com/microsoft/FluidFramework/blob/main/server/routerlicious/RELEASE_NOTES/5.0.0.md)

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

-   Update to TypeScript 5.4 ([#21214](https://github.com/microsoft/FluidFramework/pull/21214)) [0e6256c722](https://github.com/microsoft/FluidFramework/commit/0e6256c722d8bf024f4325bf02547daeeb18bfa6)

    Update package implementations to use TypeScript 5.4.5.

-   azure-client, tinylicious-client: compatibilityMode parameter added to createContainer and getContainer on AzureClient and TinyliciousClient ([#20997](https://github.com/microsoft/FluidFramework/pull/20997)) [2730787209](https://github.com/microsoft/FluidFramework/commit/2730787209a60155752d51da3c78cf97e1b5f3f9)

    To support migration from 1.x to 2.0, a compatibility mode parameter has been added to these methods on AzureClient and TinyliciousClient. When set to "1", this allows interop between the 2.0 clients and 1.x clients. When set to "2", interop with 1.x clients is disallowed but new 2.0 features may be used.

-   tinylicious-client: Types are now beta ([#21386](https://github.com/microsoft/FluidFramework/pull/21386)) [0511e59860](https://github.com/microsoft/FluidFramework/commit/0511e598600464cb0e6bddd7dc064a01cec131ed)

    `TinyliciousClient` and related types have been promoted to `@beta`.

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

### Minor Changes

-   Deprecated error-related enums have been removed ([#19067](https://github.com/microsoft/FluidFramework/issues/19067)) [59793302e5](https://github.com/microsoft/FluidFramework/commits/59793302e56784cfb6ace0e6469345f3565b3312)

    Error-related enums `ContainerErrorType`, `DriverErrorType`, `OdspErrorType` and `RouterliciousErrorType` were previously
    deprecated and are now removed. There are replacement object-based enumerations of `ContainerErrorTypes`,
    `DriverErrorTypes`, `OdspErrorTypes` and `RouterliciousErrorTypes`. Refer to the release notes of [Fluid Framework version
    2.0.0-internal.7.0.0](https://github.com/microsoft/FluidFramework/releases/tag/client_v2.0.0-internal.7.0.0) for details
    on the replacements.

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

### Major Changes

-   azure-client: Removed deprecated FluidStatic classes [9a451d4946](https://github.com/microsoft/FluidFramework/commits/9a451d4946b5c51a52e4d1ab5bf51e7b285b0d74)

    Several FluidStatic classes were unnecessarily exposed and were deprecated in an earlier release. They have been replaced with creation functions. This helps us
    keep implementations decoupled from usage which is easier to maintain and extend. It has very minimal impact on the
    public surface area of downstream packages. The removed classes are as follows:

    -   `AzureAudience` (use `IAzureAudience` instead)
    -   `TinyliciousAudience` (use `ITinyliciousAudience` instead)
    -   `DOProviderContainerRuntimeFactory`
    -   `FluidContainer`
    -   `ServiceAudience`

## 2.0.0-internal.7.4.0

### Minor Changes

-   azure-client: Deprecated FluidStatic Classes ([#18402](https://github.com/microsoft/FluidFramework/issues/18402)) [589ec39de5](https://github.com/microsoft/FluidFramework/commits/589ec39de52116c7f782319e6f6aa61bc5aa9964)

    Several FluidStatic classes were unnecessarily exposed. They have been replaced with creation functions. This helps us
    keep implementations decoupled from usage which is easier to maintain and extend. It has very minimal impact on the
    public surface area of downstream packages. The deprecated classes are as follows:

    -   `AzureAudience` (use `IAzureAudience` instead)
    -   `TinyliciousAudience` (use `ITinyliciousAudience` instead)
    -   `DOProviderContainerRuntimeFactory`
    -   `FluidContainer`
    -   `ServiceAudience`

## 2.0.0-internal.7.3.0

Dependency updates only.

## 2.0.0-internal.7.2.0

Dependency updates only.

## 2.0.0-internal.7.1.0

Dependency updates only.

## 2.0.0-internal.7.0.0

### Major Changes

-   Dependencies on @fluidframework/protocol-definitions package updated to 3.0.0 [871b3493dd](https://github.com/microsoft/FluidFramework/commits/871b3493dd0d7ea3a89be64998ceb6cb9021a04e)

    This included the following changes from the protocol-definitions release:

    -   Updating signal interfaces for some planned improvements. The intention is split the interface between signals
        submitted by clients to the server and the resulting signals sent from the server to clients.
        -   A new optional type member is available on the ISignalMessage interface and a new ISentSignalMessage interface has
            been added, which will be the typing for signals sent from the client to the server. Both extend a new
            ISignalMessageBase interface that contains common members.
    -   The @fluidframework/common-definitions package dependency has been updated to version 1.0.0.

-   Server upgrade: dependencies on Fluid server packages updated to 2.0.1 [871b3493dd](https://github.com/microsoft/FluidFramework/commits/871b3493dd0d7ea3a89be64998ceb6cb9021a04e)

    Dependencies on the following Fluid server package have been updated to version 2.0.1:

    -   @fluidframework/gitresources: 2.0.1
    -   @fluidframework/server-kafka-orderer: 2.0.1
    -   @fluidframework/server-lambdas: 2.0.1
    -   @fluidframework/server-lambdas-driver: 2.0.1
    -   @fluidframework/server-local-server: 2.0.1
    -   @fluidframework/server-memory-orderer: 2.0.1
    -   @fluidframework/protocol-base: 2.0.1
    -   @fluidframework/server-routerlicious: 2.0.1
    -   @fluidframework/server-routerlicious-base: 2.0.1
    -   @fluidframework/server-services: 2.0.1
    -   @fluidframework/server-services-client: 2.0.1
    -   @fluidframework/server-services-core: 2.0.1
    -   @fluidframework/server-services-ordering-kafkanode: 2.0.1
    -   @fluidframework/server-services-ordering-rdkafka: 2.0.1
    -   @fluidframework/server-services-ordering-zookeeper: 2.0.1
    -   @fluidframework/server-services-shared: 2.0.1
    -   @fluidframework/server-services-telemetry: 2.0.1
    -   @fluidframework/server-services-utils: 2.0.1
    -   @fluidframework/server-test-utils: 2.0.1
    -   tinylicious: 2.0.1

-   Minimum TypeScript version now 5.1.6 [871b3493dd](https://github.com/microsoft/FluidFramework/commits/871b3493dd0d7ea3a89be64998ceb6cb9021a04e)

    The minimum supported TypeScript version for Fluid 2.0 clients is now 5.1.6.

## 2.0.0-internal.6.4.0

Dependency updates only.

## 2.0.0-internal.6.3.0

Dependency updates only.

## 2.0.0-internal.6.2.0

Dependency updates only.

## 2.0.0-internal.6.1.0

Dependency updates only.

## 2.0.0-internal.6.0.0

### Major Changes

-   Upgraded typescript transpilation target to ES2020 [8abce8cdb4](https://github.com/microsoft/FluidFramework/commits/8abce8cdb4e2832fb6405fb44e393bef03d5648a)

    Upgraded typescript transpilation target to ES2020. This is done in order to decrease the bundle sizes of Fluid Framework packages. This has provided size improvements across the board for ex. Loader, Driver, Runtime etc. Reduced bundle sizes helps to load lesser code in apps and hence also helps to improve the perf.If any app wants to target any older versions of browsers with which this target version is not compatible, then they can use packages like babel to transpile to a older target.

## 2.0.0-internal.5.4.0

Dependency updates only.

## 2.0.0-internal.5.3.0

Dependency updates only.

## 2.0.0-internal.5.2.0

Dependency updates only.

## 2.0.0-internal.5.1.0

Dependency updates only.

## 2.0.0-internal.5.0.0

Dependency updates only.

## 2.0.0-internal.4.4.0

Dependency updates only.

## 2.0.0-internal.4.1.0

Dependency updates only.
