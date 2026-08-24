# @fluidframework/local-driver

## 2.116.0

### Minor Changes

- Rename minVersionForCollab to oldestSupportedClient ([#27806](https://github.com/microsoft/FluidFramework/pull/27806)) [86b912170c](https://github.com/microsoft/FluidFramework/commit/86b912170c0e12ebeb481c5201f923c72bf94498)

  The cross-client compatibility parameter has new names:
  - The
    [`MinimumVersionForCollab`](https://fluidframework.com/docs/api/runtime-definitions/minimumversionforcollab-typealias)
    type is now
    [`OldestSupportedClientVersion`](https://fluidframework.com/docs/api/runtime-definitions/oldestsupportedclientversion-typealias).
  - [`LoadContainerRuntimeParams.minVersionForCollab`](https://fluidframework.com/docs/api/container-runtime/loadcontainerruntimeparams-interface#minversionforcollab-propertysignature)
    is now
    [`LoadContainerRuntimeParams.oldestSupportedClient`](https://fluidframework.com/docs/api/container-runtime/loadcontainerruntimeparams-interface#oldestsupportedclient-propertysignature).
  - [`BaseContainerRuntimeFactoryProps.minVersionForCollab`](https://fluidframework.com/docs/api/aqueduct/basecontainerruntimefactoryprops-interface#minversionforcollab-propertysignature)
    is now
    [`BaseContainerRuntimeFactoryProps.oldestSupportedClient`](https://fluidframework.com/docs/api/aqueduct/basecontainerruntimefactoryprops-interface#oldestsupportedclient-propertysignature).
  - [`createTreeContainerRuntimeFactory`](https://fluidframework.com/docs/api/fluid-static/#createtreecontainerruntimefactory-function)
    now accepts `oldestSupportedClient`.
    `minVersionForCollaboration` remains available as a deprecated overload.
  - `@fluidframework/driver-definitions` now exports its minor-only version type as
    [`OldestSupportedServiceClientVersion`](https://fluidframework.com/docs/api/driver-definitions/oldestsupportedserviceclientversion-typealias),
    and
    [`ServiceOptions.oldestSupportedClient`](https://fluidframework.com/docs/api/driver-definitions/serviceoptions-interface#oldestsupportedclient-propertysignature)
    is available.
  - [`AzureClient`](https://fluidframework.com/docs/api/azure-client/azureclient-class),
    [`OdspClient`](https://fluidframework.com/docs/api/odsp-client/odspclient-class),
    and
    [`TinyliciousClient`](https://fluidframework.com/docs/api/tinylicious-client/tinyliciousclient-class)
    methods now use `oldestSupportedClient` and
    [`OldestSupportedClientVersion`](https://fluidframework.com/docs/api/runtime-definitions/oldestsupportedclientversion-typealias)
    in their signatures.

  The previous property and type names in `@fluidframework/runtime-definitions`,
  `@fluidframework/container-runtime`, `@fluidframework/aqueduct`, and
  `@fluidframework/fluid-static` are deprecated and will be removed in future
  releases. Where both old and new property names remain available, specifying both
  is an error. The alpha `MinimumVersionForCollaboration` type and
  `ServiceOptions.minVersionForCollaboration` property are replaced directly rather
  than retained as aliases.

  ```typescript
  // Before
  const runtime = await loadContainerRuntime({
    context,
    registryEntries,
    provideEntryPoint,
    minVersionForCollab: "2.40.0",
  });

  // After
  const runtime = await loadContainerRuntime({
    context,
    registryEntries,
    provideEntryPoint,
    oldestSupportedClient: "2.40.0",
  });
  ```

  Telemetry property names are unchanged.

## 2.115.0

### Minor Changes

- Simplify creating attached Fluid containers with ServiceClient ([#27789](https://github.com/microsoft/FluidFramework/pull/27789)) [1671447b57](https://github.com/microsoft/FluidFramework/commit/1671447b57852875ec90a9d1c16b3817ce25e004)

  Added `ServiceClient.createAttachedContainer` which creates and attaches a Fluid container in one operation.
  It is a convenient shorthand for calling `createContainer` followed by `attach` when detached-container access is not needed.

  ```typescript
  const container = await client.createAttachedContainer(dataStoreKind);
  ```

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

- New ILayerCompatDetails property on LocalDocumentServiceFactory and OdspDocumentServiceFactoryCore ([#25120](https://github.com/microsoft/FluidFramework/pull/25120)) [02acccaa06](https://github.com/microsoft/FluidFramework/commit/02acccaa06bf377ceb044e3eac4ba6ebb89e3d4f)

  A new optional property, `ILayerCompatDetails`, has been added to `LocalDocumentServiceFactory` and `OdspDocumentServiceFactoryCore`.
  This property is used by `Container` in the Loader layer to validate that the Loader and Driver layers are compatible.

  Important: this property is intended for use by Fluid Framework code only. No code outside the Fluid Framework should use or depend on this property in any way.

## 2.51.0

Dependency updates only.

## 2.50.0

Dependency updates only.

## 2.43.0

Dependency updates only.

## 2.42.0

Dependency updates only.

## 2.41.0

Dependency updates only.

## 2.40.0

Dependency updates only.

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

- Updated server dependencies ([#21514](https://github.com/microsoft/FluidFramework/pull/21514)) [9629f1d93a](https://github.com/microsoft/FluidFramework/commit/9629f1d93a7e412c0cb2f65cc21da0c95ff8981d)

  The following Fluid server dependencies have been updated to the latest version, 5.0.0. [See the full changelog.](https://github.com/microsoft/FluidFramework/blob/main/server/routerlicious/RELEASE_NOTES/5.0.0.md)
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

- Update to TypeScript 5.4 ([#21214](https://github.com/microsoft/FluidFramework/pull/21214)) [0e6256c722](https://github.com/microsoft/FluidFramework/commit/0e6256c722d8bf024f4325bf02547daeeb18bfa6)

  Update package implementations to use TypeScript 5.4.5.

## 2.0.0-rc.4.0.0

Dependency updates only.

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

### Minor Changes

- driver-definitions: update submitSignal content type to string [97d68aa06b](https://github.com/microsoft/FluidFramework/commit/97d68aa06bd5c022ecb026655814aea222a062ae)

  Change IDocumentDeltaConnection.submitSignal's content argument type to string which represents actual/known use.

## 2.0.0-rc.2.0.0

### Minor Changes

- Resolved URLs no longer use non-standard protocols ([#19840](https://github.com/microsoft/FluidFramework/issues/19840)) [9d3d185183](https://github.com/microsoft/FluidFramework/commits/9d3d1851830d953792a6dfad60dde6f1c59480de)

  Previously, `IResolvedUrl.url` could use a non-standard protocol like `fluid://`, `fluid-odsp://`, or `fluid-test://`. These have been replaced with `https://` to permit standards-compliant URL parsing.

- driver-definitions: repositoryUrl removed from IDocumentStorageService ([#19522](https://github.com/microsoft/FluidFramework/issues/19522)) [90eb3c9d33](https://github.com/microsoft/FluidFramework/commits/90eb3c9d33d80e24caa1393a50f414c5602f6aa3)

  The `repositoryUrl` member of `IDocumentStorageService` was unused and always equal to the empty string. It has been removed.

- container-definitions: Added containerMetadata prop on IContainer interface ([#19142](https://github.com/microsoft/FluidFramework/issues/19142)) [d0d77f3516](https://github.com/microsoft/FluidFramework/commits/d0d77f3516d67f3c9faedb47b20dbd4e309c3bc2)

  Added `containerMetadata` prop on IContainer interface.

- runtime-definitions: Moved ISignalEnvelope interface to core-interfaces ([#19142](https://github.com/microsoft/FluidFramework/issues/19142)) [d0d77f3516](https://github.com/microsoft/FluidFramework/commits/d0d77f3516d67f3c9faedb47b20dbd4e309c3bc2)

  The `ISignalEnvelope` interface has been moved to the @fluidframework/core-interfaces package.

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

- local-driver: LocalDocumentStorageService class property type changes [9a451d4946](https://github.com/microsoft/FluidFramework/commits/9a451d4946b5c51a52e4d1ab5bf51e7b285b0d74)

  The `repositoryUrl` property on the `LocalDocumentStorageService` class has changed from a property getter to a
  `readonly` field. While this is an API change, there should be no changes required on the consumer side since calling
  code should remain the same.

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

- routerlicious-driver: remove dead blob aggregation concepts and code [871b3493dd](https://github.com/microsoft/FluidFramework/commits/871b3493dd0d7ea3a89be64998ceb6cb9021a04e)

  Dead concepts blob aggregation like `aggregateBlobsSmallerThanBytes` and `minBlobSize` have been removed.

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
