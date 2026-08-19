# @fluidframework/runtime-utils

## 2.116.0

Dependency updates only.

## 2.115.0

Dependency updates only.

## 2.114.0

### Minor Changes

- Add new @alpha ServiceClient API for creating and loading Fluid containers ([#27693](https://github.com/microsoft/FluidFramework/pull/27693)) [ee47192d4a](https://github.com/microsoft/FluidFramework/commit/ee47192d4ae91bc28f9154c4d1ead2acad762f3c)

  This introduces an experimental (`@alpha`), service-agnostic API for working with Fluid containers whose root is an arbitrary data store, along with an in-memory implementation for testing.

  The new surface is made up of:
  - `ServiceClient` (`@fluidframework/driver-definitions`): the entry point for creating and loading containers. Along with it come the supporting container types (`FluidContainer`, `FluidContainerWithService`, `FluidContainerAttached`), the data store model (`DataStoreKind`, `DataStoreKey`, `DataStoreRegistry`, `DataStoreCreator`), and the generic registry primitives (`Registry`, `RegistryKey`, `lookupInRegistry`, `createBasicRegistryKey`).
  - `defineDataStore` and `sharedObjectRegistryFromIterable` (`@fluidframework/shared-object-base`): build a `DataStoreKind` from a root shared object and a registry of shared object kinds.
  - `defineTreeDataStore` and `instantiateTreeFirstTime` (`@fluidframework/tree`): a SharedTree-specific convenience wrapper that produces a `DataStoreKind` backed by a `TreeView`.
  - `startEphemeralService` (`@fluidframework/local-driver`): starts an in-memory `EphemeralService` for tests. The service owns the lifetime of the in-memory documents and resources, and produces `ServiceClient`s connected to it (via `EphemeralService.newClient` or `EphemeralService.defaultClient`). The helpers `cleanupEphemeralService` and `getDefaultEphemeralService` manage an optional default service instance.

  Apart from the `@fluidframework/local-driver` helpers (which come from `@fluidframework/local-driver/alpha`), these APIs are also re-exported from `fluid-framework`. None reference any `@legacy` types.

  Example:

  ```typescript
  import { startEphemeralService } from "@fluidframework/local-driver/alpha";
  import {
    ServiceClient,
    defineTreeDataStore,
    TreeViewConfiguration,
    SchemaFactory,
  } from "fluid-framework/alpha";
  import { strict as assert } from "node:assert";

  // Start an ephemeral in-memory service and get a ServiceClient connected to it.
  const service = startEphemeralService();
  const client: ServiceClient = service.defaultClient;
  // Define a DataStoreKind which uses a SharedTree.
  // In this case the schema is for a single number with an initializer that starts the it at 1.
  // This schema is captures in the type allowing for strongly typed access to the data in the tree,
  // where the type matches the schema based runtime enforcement of the schema.
  const numberStore = defineTreeDataStore({
    type: "my-app-root",
    config: new TreeViewConfiguration({ schema: SchemaFactory.number }),
    initializer: () => 1,
  });

  // Create a container in the service with the above DataStoreKind.
  // Ideally this creation would use a service independent API, and only the attach call would be service dependent,
  // but that is not supported yet.
  const detachedContainer1 = await client.createContainer(numberStore);
  const container1 = await detachedContainer1.attach();

  // We now have easy and type safe access to the data in the tree, which will be synced over the service.
  assert.equal(container1.data.root, 1);

  // A second client can load the same container from the service, and will see the same data.
  const container2 = await client.loadContainer(container1.id, numberStore);
  assert.equal(container2.data.root, 1);

  // Both clients can modify the data, and the changes will be synced over the service.
  container2.data.root = 2;
  // Since we are using an ephemeral service, we can await the synchronization using service.synchronize.
  await service.synchronize();

  // And now the changes are visible for all clients.
  assert.equal(container1.data.root, 2);
  assert.equal(container2.data.root, 2);
  ```

  Note that this example does a couple of things which are difficult to do with the other API surfaces:
  1. It creates a container, then loads a second copy of it, allowing for collaboration. There is currently no non-legacy API surface which allows this without spawning a server process. This is also cleaner than the exacting legacy API options, and can replace the test specific APIs for this as well.
  2. It creates a container which has a SharedTree at the root, and nothing else. This avoids depending on legacy DDS implementations, which is great for long-term document support and bundle size. This is currently impossible using `fluid-static`, which forces a special root data store. It is also impossible if using `aqueduct`, which forces a root directory in every data store. It can be done using the low level legacy APIs directly, but this new API for it is much simpler.
  3. There is a common interface all services implement (`ServiceClient`), making the container creation part of the code work for any service implementation.

## 2.113.0

Dependency updates only.

## 2.112.0

Dependency updates only.

## 2.111.0

Dependency updates only.

## 2.110.0

Dependency updates only.

## 2.103.0

Dependency updates only.

## 2.102.0

Dependency updates only.

## 2.101.0

Dependency updates only.

## 2.100.0

### Minor Changes

- Node 22 is now the minimum supported Node.js version ([#27116](https://github.com/microsoft/FluidFramework/pull/27116)) [e8214d29663](https://github.com/microsoft/FluidFramework/commit/e8214d29663f5ee98d737daed82506a25d8de8d0)

  All Fluid Framework client packages now require Node.js 22 or later. This aligns with the standing Node upgrade policy as Node 20 reaches end-of-life on April 30, 2026.

## 2.93.0

Dependency updates only.

## 2.92.0

Dependency updates only.

## 2.91.0

Dependency updates only.

## 2.90.0

Dependency updates only.

## 2.83.0

Dependency updates only.

## 2.82.0

Dependency updates only.

## 2.81.0

Dependency updates only.

## 2.80.0

Dependency updates only.

## 2.74.0

Dependency updates only.

## 2.73.0

Dependency updates only.

## 2.72.0

Dependency updates only.

## 2.71.0

Dependency updates only.

## 2.70.0

Dependency updates only.

## 2.63.0

Dependency updates only.

## 2.62.0

Dependency updates only.

## 2.61.0

Dependency updates only.

## 2.60.0

Dependency updates only.

## 2.53.0

Dependency updates only.

## 2.52.0

### Minor Changes

- Moved MinimumVersionForCollab to @fluidframework/runtime-definitions ([#25059](https://github.com/microsoft/FluidFramework/pull/25059)) [4a7b370667](https://github.com/microsoft/FluidFramework/commit/4a7b3706675139af6d8aaae707b96b74081f1fc8)

  MinimumVersionForCollab has been moved from @fluidframework/container-runtime to @fluidframework/runtime-definitions.
  The export in @fluidframework/container-runtime is now deprecated and will be removed in a future version.
  Consumers should import it from @fluidframework/runtime-definitions going forward.

## 2.51.0

Dependency updates only.

## 2.50.0

### Minor Changes

- IFluidHandleInternal.bind (deprecated) has been removed ([#24974](https://github.com/microsoft/FluidFramework/pull/24974)) [07e183795f](https://github.com/microsoft/FluidFramework/commit/07e183795fa8118fae717c118ab7a7945ac1ad57)

  `IFluidHandleInternal.bind` was deprecated in 2.40 and has now been removed. See [release notes entry](https://github.com/microsoft/FluidFramework/releases/tag/client_v2.40.0#user-content-ifluidhandleinternalbind-has-been-deprecated-24553) for more details.

## 2.43.0

Dependency updates only.

## 2.42.0

Dependency updates only.

## 2.41.0

Dependency updates only.

## 2.40.0

### Minor Changes

- IFluidHandleInternal.bind has been deprecated ([#24553](https://github.com/microsoft/FluidFramework/pull/24553)) [8a4362a7ed](https://github.com/microsoft/FluidFramework/commit/8a4362a7edef3a97fee13c9d23bea49448ba2a6a)

  Handle binding is an internal concept used to make sure objects attach to the Container graph when their handle is stored in a DDS which is itself attached.
  The source of the "bind" operation has been assumed to be any handle, but only one implementation is actually supported (`SharedObjectHandle`, not exported itself).

  So the `bind` function is now deprecated on the `IFluidHandleInterface`, moving instead to internal types supporting the one valid implementation.
  It's also deprecated on the various exported handle implementations that don't support it (each is either no-op, pass-through, or throwing).

  No replacement is offered, this API was never meant to be called from outside of the Fluid Framework.

## 2.33.0

Dependency updates only.

## 2.32.0

Dependency updates only.

## 2.31.0

Dependency updates only.

## 2.30.0

Dependency updates only.

## 2.23.0

Dependency updates only.

## 2.22.0

Dependency updates only.

## 2.21.0

Dependency updates only.

## 2.20.0

Dependency updates only.

## 2.13.0

Dependency updates only.

## 2.12.0

Dependency updates only.

## 2.11.0

Dependency updates only.

## 2.10.0

### Minor Changes

- New compareFluidHandle function for comparing FluidHandles ([#22997](https://github.com/microsoft/FluidFramework/pull/22997)) [8d470085fb](https://github.com/microsoft/FluidFramework/commit/8d470085fb41a84212a993a1ebbbf903fd4f16b6)

  The new `compareFluidHandle` function has been added to allow comparing handles without having to inspect their internals.

- The inbound and outbound properties have been removed from IDeltaManager ([#22282](https://github.com/microsoft/FluidFramework/pull/22282)) [45a57693f2](https://github.com/microsoft/FluidFramework/commit/45a57693f291e0dc5e91af7f29a9b9c8f82dfad5)

  The inbound and outbound properties were [deprecated in version 2.0.0-rc.2.0.0](https://github.com/microsoft/FluidFramework/blob/main/RELEASE_NOTES/2.0.0-rc.2.0.0.md#container-definitions-deprecate-ideltamanagerinbound-and-ideltamanageroutbound) and have been removed from `IDeltaManager`.

  `IDeltaManager.inbound` contained functionality that could break core runtime features such as summarization and processing batches if used improperly. Data loss or corruption could occur when `IDeltaManger.inbound.pause()` or `IDeltaManager.inbound.resume()` were called.

  Similarly, `IDeltaManager.outbound` contained functionality that could break core runtime features such as generation of batches and chunking. Data loss or corruption could occur when `IDeltaManger.inbound.pause()` or `IDeltaManager.inbound.resume()` were called.

  #### Alternatives
  - Alternatives to `IDeltaManager.inbound.on("op", ...)` are `IDeltaManager.on("op", ...)`
  - Alternatives to calling `IDeltaManager.inbound.pause`, `IDeltaManager.outbound.pause` for `IContainer` disconnect use `IContainer.disconnect`.
  - Alternatives to calling `IDeltaManager.inbound.resume`, `IDeltaManager.outbound.resume` for `IContainer` reconnect use `IContainer.connect`.

## 2.5.0

Dependency updates only.

## 2.4.0

Dependency updates only.

## 2.3.0

Dependency updates only.

## 2.2.0

### Minor Changes

- New `isFluidHandle` type guard to check if an object is an `IFluidHandle` ([#22029](https://github.com/microsoft/FluidFramework/pull/22029)) [7827d1040a](https://github.com/microsoft/FluidFramework/commit/7827d1040a9ebc0bd11388dc31f15370ea9f68d3)

  The `isFluidHandle` type guard function is now exported and can be used to detect which objects are `IFluidHandle`s.
  Since `IFluidHandle` often needs special handling (for example when serializing since it's not JSON compatible),
  having a dedicated detection function for it is useful.
  Doing this detection was possible previously using the `tree` package's schema system via `Tree.is(value, new SchemaFactory("").handle)`,
  but can now be done with just `isFluidHandle(value)`.

## 2.1.0

Dependency updates only.

## 2.0.0-rc.5.0.0

### Minor Changes

- Update to TypeScript 5.4 ([#21214](https://github.com/microsoft/FluidFramework/pull/21214)) [0e6256c722](https://github.com/microsoft/FluidFramework/commit/0e6256c722d8bf024f4325bf02547daeeb18bfa6)

  Update package implementations to use TypeScript 5.4.5.

## 2.0.0-rc.4.0.0

### Minor Changes

- Deprecated members of IFluidHandle are split off into new IFluidHandleInternal interface [96872186d0](https://github.com/microsoft/FluidFramework/commit/96872186d0d0f245c1fece7d19b3743e501679b6)

  Split IFluidHandle into two interfaces, `IFluidHandle` and `IFluidHandleInternal`.
  Code depending on the previously deprecated members of IFluidHandle can access them by using `toFluidHandleInternal` from `@fluidframework/runtime-utils/legacy`.

  External implementation of the `IFluidHandle` interface are not supported: this change makes the typing better convey this using the `ErasedType` pattern.
  Any existing and previously working, and now broken, external implementations of `IFluidHandle` should still work at runtime, but will need some unsafe type casts to compile.
  Such handle implementation may break in the future and thus should be replaced with use of handles produced by the Fluid Framework client packages.

- Type Erase IFluidDataStoreRuntime.deltaManager [96872186d0](https://github.com/microsoft/FluidFramework/commit/96872186d0d0f245c1fece7d19b3743e501679b6)

  Make IFluidDataStoreRuntime.deltaManager have an opaque type.
  Marks the following types which were reachable from it as alpha:
  - IConnectionDetails
  - IDeltaSender
  - IDeltaManagerEvents
  - IDeltaManager
  - IDeltaQueueEvents
  - IDeltaQueue
  - ReadOnlyInfo

  As a temporary workaround, users needing access to the full delta manager API can use the `@alpha` `toDeltaManagerInternal` API to retrieve its members, but should migrate away from requiring access to those APIs.

  Implementing a custom `IFluidDataStoreRuntime` is not supported: this is now indicated by it being marked with `@sealed`.

## 2.0.0-rc.3.0.0

### Major Changes

- Packages now use package.json "exports" and require modern module resolution [97d68aa06b](https://github.com/microsoft/FluidFramework/commit/97d68aa06bd5c022ecb026655814aea222a062ae)

  Fluid Framework packages have been updated to use the [package.json "exports"
  field](https://nodejs.org/docs/latest-v18.x/api/packages.html#exports) to define explicit entry points for both
  TypeScript types and implementation code.

  This means that using Fluid Framework packages require the following TypeScript settings in tsconfig.json:
  - `"moduleResolution": "Node16"` with `"module": "Node16"`
  - `"moduleResolution": "Bundler"` with `"module": "ESNext"`

  We recommend using Node16/Node16 unless absolutely necessary. That will produce transpiled JavaScript that is suitable
  for use with modern versions of Node.js _and_ Bundlers.
  [See the TypeScript documentation](https://www.typescriptlang.org/tsconfig#moduleResolution) for more information
  regarding the module and moduleResolution options.

  **Node10 moduleResolution is not supported; it does not support Fluid Framework's API structuring pattern that is used
  to distinguish stable APIs from those that are in development.**

## 2.0.0-rc.2.0.0

### Minor Changes

- container-runtime: New feature: ID compression for DataStores & DDSs ([#19859](https://github.com/microsoft/FluidFramework/issues/19859)) [51f0d3db73](https://github.com/microsoft/FluidFramework/commits/51f0d3db737800e1c30ea5e3952d38ff30ffc7da)

  ### Key changes
  1. A new API IContainerRuntimeBase.generateDocumentUniqueId() is exposed. This API will opportunistically generate IDs in short format (non-negative numbers). If it can't achieve that, it will return UUID strings. UUIDs generated will have low entropy in groups and will compress well. It can be leveraged anywhere in container where container unique IDs are required. I.e. any place that uses uuid() and stores data in container is likely candidate to start leveraging this API.
  2. Data store internal IDs (IDs that are auto generated by FF system) will opportunistically be generated in shorter form. Data stores created in detached container will always have short IDs, data stores created in attached container will opportunistically be short (by using newly added IContainerRuntimeBase.generateDocumentUniqueId() capability)
  3. Similar DDS names will be opportunistically short (same considerations for detached DDS vs. attached DDS)

  ### Implementation details
  1. Container level ID Compressor can now be enabled with delay. With such setting, only new IContainerRuntimeBase.generateDocumentUniqueId() is exposed (ID Compressor is not exposed in such case, as leveraging any of its other capabilities requires future container sessions to load ID Compressor on container load, for correctness reasons). Once Container establishes connection and any changes are made in container, newly added API will start generating more compact IDs (in most cases).

  ### Breaking changes
  1. DDS names can no longer start with "\_" symbol - this is reserved for FF needs. I've validated that's not an issue for AzureClient (it only creates root object by name, everything else is referred by handle). Our main internal partners almost never use named DDSs (I can find only 4 instances in Loop).

  ### Backward compatibility considerations
  1. Data store internal IDs could collide with earlier used names data stores. Earlier versions of FF framework (before DataStore aliasing feature was added) allowed customers to supply IDs for data stores. And thus, files created with earlier versions of framework could have data store IDs that will be similar to names FF will use for newly created data stores ("A", ... "Z", "a"..."z", "AA", etc.). While such collision is possible, it's very unlikely (almost impossible) if user-provided names were at least 4-5 characters long.
  2. If application runs to these problems, or wants to reduce risks, consider disabling ID compressor via IContainerRuntimeOptions.enableRuntimeIdCompressor = "off".

  ### Minor changes
  1. IContainerRuntime.createDetachedRootDataStore() is removed. Please use IContainerRuntime.createDetachedDataStore and IDataStore.trySetAlias() instead
  2. IContainerRuntimeOptions.enableRuntimeIdCompressor has been changes from boolean to tri-state.

## 2.0.0-rc.1.0.0

### Minor Changes

- Updated server dependencies ([#19122](https://github.com/microsoft/FluidFramework/issues/19122)) [25366b4229](https://github.com/microsoft/FluidFramework/commits/25366b422918cb43685c5f328b50450749592902)

  The following Fluid server dependencies have been updated to the latest version, 3.0.0. [See the full changelog.](https://github.com/microsoft/FluidFramework/releases/tag/server_v3.0.0)
  - @fluidframework/gitresources
  - @fluidframework/server-kafka-orderer
  - @fluidframework/server-lambdas
  - @fluidframework/server-lambdas-driver
  - @fluidframework/server-local-server
  - @fluidframework/server-memory-orderer
  - @fluidframework/protocol-base
  - @fluidframework/server-routerlicious
  - @fluidframework/server-routerlicious-base
  - @fluidframework/server-services
  - @fluidframework/server-services-client
  - @fluidframework/server-services-core
  - @fluidframework/server-services-ordering-kafkanode
  - @fluidframework/server-services-ordering-rdkafka
  - @fluidframework/server-services-ordering-zookeeper
  - @fluidframework/server-services-shared
  - @fluidframework/server-services-telemetry
  - @fluidframework/server-services-utils
  - @fluidframework/server-test-utils
  - tinylicious

- Updated @fluidframework/protocol-definitions ([#19122](https://github.com/microsoft/FluidFramework/issues/19122)) [25366b4229](https://github.com/microsoft/FluidFramework/commits/25366b422918cb43685c5f328b50450749592902)

  The @fluidframework/protocol-definitions dependency has been upgraded to v3.1.0. [See the full
  changelog.](https://github.com/microsoft/FluidFramework/blob/main/common/lib/protocol-definitions/CHANGELOG.md#310)

## 2.0.0-internal.8.0.0

### Major Changes

- container-definitions: Fix ISnapshotTreeWithBlobContents and mark internal [9a451d4946](https://github.com/microsoft/FluidFramework/commits/9a451d4946b5c51a52e4d1ab5bf51e7b285b0d74)

  `ISnapshotTreeWithBlobContents` is an internal type that should not be used externally. Additionally, the type didn't
  match the usage, specifically in runtime-utils where an `any` cast was used to work around undefined blobContents. The
  type has been updated to reflect that blobContents can be undefined.

- runtime-utils: Removed requestFluidObject [9a451d4946](https://github.com/microsoft/FluidFramework/commits/9a451d4946b5c51a52e4d1ab5bf51e7b285b0d74)

  The `requestFluidObject` utility has been removed. Please migrate all usage of it to the new `entryPoint` pattern.

  See [Removing-IFluidRouter.md](https://github.com/microsoft/FluidFramework/blob/main/packages/common/core-interfaces/Removing-IFluidRouter.md) for more details.

## 2.0.0-internal.7.4.0

Dependency updates only.

## 2.0.0-internal.7.3.0

Dependency updates only.

## 2.0.0-internal.7.2.0

Dependency updates only.

## 2.0.0-internal.7.1.0

Dependency updates only.

## 2.0.0-internal.7.0.0

### Major Changes

- Dependencies on @fluidframework/protocol-definitions package updated to 3.0.0 [871b3493dd](https://github.com/microsoft/FluidFramework/commits/871b3493dd0d7ea3a89be64998ceb6cb9021a04e)

  This included the following changes from the protocol-definitions release:
  - Updating signal interfaces for some planned improvements. The intention is split the interface between signals
    submitted by clients to the server and the resulting signals sent from the server to clients.
    - A new optional type member is available on the ISignalMessage interface and a new ISentSignalMessage interface has
      been added, which will be the typing for signals sent from the client to the server. Both extend a new
      ISignalMessageBase interface that contains common members.
  - The @fluidframework/common-definitions package dependency has been updated to version 1.0.0.

- DEPRECATED: container-loader: Various request related APIs have been deprecated [871b3493dd](https://github.com/microsoft/FluidFramework/commits/871b3493dd0d7ea3a89be64998ceb6cb9021a04e)

  Please remove all calls to the following functions and instead use the new `entryPoint` pattern:
  - `requestFluidObject`
  - `requestResolvedObjectFromContainer`
  - `getDefaultObjectFromContainer`
  - `getObjectWithIdFromContainer`
  - `getObjectFromContainer`

  See [Removing-IFluidRouter.md](https://github.com/microsoft/FluidFramework/blob/main/packages/common/core-interfaces/Removing-IFluidRouter.md) for more details.

- Server upgrade: dependencies on Fluid server packages updated to 2.0.1 [871b3493dd](https://github.com/microsoft/FluidFramework/commits/871b3493dd0d7ea3a89be64998ceb6cb9021a04e)

  Dependencies on the following Fluid server package have been updated to version 2.0.1:
  - @fluidframework/gitresources: 2.0.1
  - @fluidframework/server-kafka-orderer: 2.0.1
  - @fluidframework/server-lambdas: 2.0.1
  - @fluidframework/server-lambdas-driver: 2.0.1
  - @fluidframework/server-local-server: 2.0.1
  - @fluidframework/server-memory-orderer: 2.0.1
  - @fluidframework/protocol-base: 2.0.1
  - @fluidframework/server-routerlicious: 2.0.1
  - @fluidframework/server-routerlicious-base: 2.0.1
  - @fluidframework/server-services: 2.0.1
  - @fluidframework/server-services-client: 2.0.1
  - @fluidframework/server-services-core: 2.0.1
  - @fluidframework/server-services-ordering-kafkanode: 2.0.1
  - @fluidframework/server-services-ordering-rdkafka: 2.0.1
  - @fluidframework/server-services-ordering-zookeeper: 2.0.1
  - @fluidframework/server-services-shared: 2.0.1
  - @fluidframework/server-services-telemetry: 2.0.1
  - @fluidframework/server-services-utils: 2.0.1
  - @fluidframework/server-test-utils: 2.0.1
  - tinylicious: 2.0.1

- Minimum TypeScript version now 5.1.6 [871b3493dd](https://github.com/microsoft/FluidFramework/commits/871b3493dd0d7ea3a89be64998ceb6cb9021a04e)

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

- Upgraded typescript transpilation target to ES2020 [8abce8cdb4](https://github.com/microsoft/FluidFramework/commits/8abce8cdb4e2832fb6405fb44e393bef03d5648a)

  Upgraded typescript transpilation target to ES2020. This is done in order to decrease the bundle sizes of Fluid Framework packages. This has provided size improvements across the board for ex. Loader, Driver, Runtime etc. Reduced bundle sizes helps to load lesser code in apps and hence also helps to improve the perf.If any app wants to target any older versions of browsers with which this target version is not compatible, then they can use packages like babel to transpile to a older target.

- Remove packagePathToTelemetryProperty Function [8abce8cdb4](https://github.com/microsoft/FluidFramework/commits/8abce8cdb4e2832fb6405fb44e393bef03d5648a)

  packagePathToTelemetryProperty was previously deprecated and is now removed. Use tagCodeArtifacts instead.

## 2.0.0-internal.5.4.0

Dependency updates only.

## 2.0.0-internal.5.3.0

Dependency updates only.

## 2.0.0-internal.5.2.0

Dependency updates only.

## 2.0.0-internal.5.1.0

Dependency updates only.

## 2.0.0-internal.5.0.0

### Major Changes

- The `@fluidframework/garbage-collector` package was deprecated in version 2.0.0-internal.4.1.0. [8b242fdc79](https://github.com/microsoft/FluidFramework/commits/8b242fdc796714cf1da9ad3f90d02efb122af0c2)
  It has now been removed with the following functions, interfaces, and types in it.
  - `cloneGCData`
  - `concatGarbageCollectionData`
  - `concatGarbageCollectionStates`
  - `GCDataBuilder`
  - `getGCDataFromSnapshot`
  - `IGCResult`
  - `removeRouteFromAllNodes`
  - `runGarbageCollection`
  - `trimLeadingAndTrailingSlashes`
  - `trimLeadingSlashes`
  - `trimTrailingSlashes`
  - `unpackChildNodesGCDetails`
  - `unpackChildNodesUsedRoutes`

## 2.0.0-internal.4.4.0

Dependency updates only.

## 2.0.0-internal.4.1.0

### Minor Changes

- GC interfaces removed from runtime-definitions ([#14750](https://github.com/microsoft/FluidFramework/pull-requests/14750)) [60274eacab](https://github.com/microsoft/FluidFramework/commits/60274eacabf14d42f52f6ad1c2f64356e64ba1a2)

  The following interfaces available in `@fluidframework/runtime-definitions` are internal implementation details and have been deprecated for public use. They will be removed in an upcoming release.
  - `IGarbageCollectionNodeData`
  - `IGarbageCollectionState`
  - `IGarbageCollectionSnapshotData`
  - `IGarbageCollectionSummaryDetailsLegacy`

- @fluidframework/garbage-collector deprecated ([#14750](https://github.com/microsoft/FluidFramework/pull-requests/14750)) [60274eacab](https://github.com/microsoft/FluidFramework/commits/60274eacabf14d42f52f6ad1c2f64356e64ba1a2)

  The `@fluidframework/garbage-collector` package is deprecated with the following functions, interfaces, and types in it.
  These are internal implementation details and have been deprecated for public use. They will be removed in an upcoming
  release.
  - `cloneGCData`
  - `concatGarbageCollectionData`
  - `concatGarbageCollectionStates`
  - `GCDataBuilder`
  - `getGCDataFromSnapshot`
  - `IGCResult`
  - `removeRouteFromAllNodes`
  - `runGarbageCollection`
  - `trimLeadingAndTrailingSlashes`
  - `trimLeadingSlashes`
  - `trimTrailingSlashes`
  - `unpackChildNodesGCDetails`
  - `unpackChildNodesUsedRoutes`
