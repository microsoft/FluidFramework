# @fluidframework/azure-client

## 3.0.0

### Minor Changes

- Require oldest supported clients to use Fluid Framework 2.0 or later ([#28127](https://github.com/microsoft/FluidFramework/pull/28127)) [98956144ada](https://github.com/microsoft/FluidFramework/commit/98956144ada9cfc3a278e73adb2d5812b5ce2a67)

  Client 3.0 narrows
  [`OldestSupportedClientVersion`](https://fluidframework.com/docs/api/runtime-definitions/oldestsupportedclientversion-typealias)
  to stable 2.x versions and 3.x minor checkpoints whose patch is zero. The deprecated
  [`MinimumVersionForCollab`](https://fluidframework.com/docs/api/runtime-definitions/minimumversionforcollab-typealias)
  alias inherits the same restriction and remains available until Client 4.0.

  Container runtimes now reject values below `"2.0.0"` and prerelease values. APIs that still
  permit the setting to be omitted use `"2.0.0"`, with the same runtime defaults and validation
  as explicitly passing `"2.0.0"`.

  Before upgrading an application to Client 3.0, upgrade every active deployment that must
  collaborate to Fluid Framework 2.0.0 or later. Explicit compatibility settings must use the
  canonical property or Azure, ODSP, or Tinylicious service-client argument with a stable 2.x
  version or a 3.x minor checkpoint such as `"3.1.0"`:

  ```typescript
  const { container } = await azureClient.getContainer(
    id,
    schema,
    "2.0.0", // oldestSupportedClient
  );
  ```

  See [microsoft/FluidFramework#27460](https://github.com/microsoft/FluidFramework/issues/27460)
  for migration context.

- Removal of direct CommonJS support ([#28124](https://github.com/microsoft/FluidFramework/pull/28124)) [0f84e3b8878](https://github.com/microsoft/FluidFramework/commit/0f84e3b8878a5e75b2253976d98fd963bbd9db88)

  Direct `require()` import is no longer directly supported.
  Package is transpiled as ECMAScript Module.

  See [Removal of direct CommonJS support in v3.0](https://github.com/microsoft/FluidFramework/issues/27444) for more information.

- Remove deprecated compatibility mode APIs ([#27909](https://github.com/microsoft/FluidFramework/pull/27909)) [103cc0b7cbf](https://github.com/microsoft/FluidFramework/commit/103cc0b7cbf778d7d52ae1abc6e768107448836a)

  Deprecated `CompatibilityMode` exports and overloads have been removed from `@fluidframework/fluid-static`, `@fluidframework/azure-client`, and `@fluidframework/tinylicious-client`.

  Use `OldestSupportedClientVersion` SemVer strings instead:
  - Pass `oldestSupportedClient` to `createTreeContainerRuntimeFactory`.
  - Pass an `OldestSupportedClientVersion` as the `oldestSupportedClient` argument to `AzureClient.createContainer`, `AzureClient.getContainer`, `AzureClient.viewContainerVersion`, `TinyliciousClient.createContainer`, and `TinyliciousClient.getContainer`.
  - Legacy mode `"1"` has no Client 3.0 equivalent. Upgrade every collaborating 1.x deployment before adopting Client 3.0.
  - Replace legacy mode `"2"` with `oldestSupportedClient: "2.0.0"` or a later supported version.

  Client 3.0 requires `oldestSupportedClient` values of `"2.0.0"` or later.

  See [Remove `CompatibilityMode`](https://github.com/microsoft/FluidFramework/issues/23289) and [advance the minimum collaboration version to 2.0.0](https://github.com/microsoft/FluidFramework/issues/27460) for more information.

- Require modern TypeScript module resolution ([#27970](https://github.com/microsoft/FluidFramework/pull/27970)) [325e2016ca9](https://github.com/microsoft/FluidFramework/commit/325e2016ca9978d4a1f7552c97ba34feac9df41f)

  Fluid Framework Client packages no longer include type declaration compatibility entrypoints for TypeScript's legacy Node10 resolution mode (`"moduleResolution": "node"` or `"node10"`).
  Applications upgrading to Fluid Framework 3.0 must use one of the following supported configurations:
  - `"module": "Node16"` with `"moduleResolution": "Node16"`
  - `"module": "NodeNext"` with `"moduleResolution": "NodeNext"`
  - `"module": "ESNext"` with `"moduleResolution": "Bundler"`

  Existing public package entrypoints exposed through `package.json` exports, including `/alpha`, `/beta`, and `/legacy`, remain available under supported module resolution modes.

  See [Removal of Node10 resolutions in v3.0](https://github.com/microsoft/FluidFramework/issues/27457) for more information.

- Require a log level for every telemetry event ([#27982](https://github.com/microsoft/FluidFramework/pull/27982)) [f2410e1380d](https://github.com/microsoft/FluidFramework/commit/f2410e1380db9e22717cbb4d87055d94480e3f1b)

  The `logLevel` parameter of `ITelemetryBaseLogger.send` and the inherited `ITelemetryLoggerExt.send` is now required.
  Callers must select a `LogLevel` for every event they log.

  Explicitly specifying a level makes logging intent part of every call site, which enables consistent filtering and sampling of telemetry.

  #### Migration for callers

  Pass a `LogLevel` for every event.
  To preserve the behavior of a call that previously omitted the level, use `LogLevel.essential`:

  ```typescript
  import { LogLevel } from "@fluidframework/core-interfaces";

  // Before
  logger.send({ category: "generic", eventName: "ExampleEvent" });

  // After
  logger.send(
    { category: "generic", eventName: "ExampleEvent" },
    LogLevel.essential,
  );
  ```

  #### Migration for logger implementations

  This is a compile-time requirement on callers only; nothing about how events are dispatched at runtime has changed.

  Logger implementations should keep declaring `logLevel` as optional and treat an omitted level as `LogLevel.essential`:

  ```typescript
  import {
    LogLevel,
    type ITelemetryBaseEvent,
    type ITelemetryBaseLogger,
  } from "@fluidframework/core-interfaces";

  class MyLogger implements ITelemetryBaseLogger {
    public send(event: ITelemetryBaseEvent, logLevel?: LogLevel): void {
      const level = logLevel ?? LogLevel.essential;
      // ...
    }
  }
  ```

  Fluid supports running with a mix of package versions, so code compiled before `logLevel` became required still calls `send(event)` with a single argument, and will for as long as those versions are supported.
  An implementation that assumes `logLevel` is always defined can therefore silently drop those events or handle them at the wrong level.

  This layer-compatibility guidance can be retired only after the compatibility window for callers that may omit `logLevel` has closed in a future coordinated breaking change.
  See the `ITelemetryBaseLogger` API documentation and [microsoft/FluidFramework#27595](https://github.com/microsoft/FluidFramework/issues/27595) for more information.

- Client packages now target ES2022 ([#27846](https://github.com/microsoft/FluidFramework/pull/27846)) [91c78541bdd](https://github.com/microsoft/FluidFramework/commit/91c78541bddcbca5d6c5f357b023eeaee617d885)

  The TypeScript compilation `target` and `lib` for the Fluid Framework client packages have been raised from ES2021/ES2020 to **ES2022**.
  The published JavaScript now uses ES2022 language features (with correspondingly less down-leveling), so consuming these packages requires a runtime that supports ES2022.
  All actively supported Node.js versions and evergreen browsers already meet this requirement.

  Note that Fluid Framework has not officially supported targets older than ES2022 since before 2.0: this is documented in [ClientRequirements.md](https://github.com/microsoft/FluidFramework/blob/main/ClientRequirements.md) as well as the README for every client package.

  It is possible this change could impact users of less up to date JavaScript runtimes.
  Impacted users can use a tool like [babel](https://babeljs.io/) to transpile out unsupported language features.

- Build with TypeScript 6 ([#28052](https://github.com/microsoft/FluidFramework/pull/28052)) [7ab015c49de](https://github.com/microsoft/FluidFramework/commit/7ab015c49deec84833cdfe1fb5e1606b901f6e81)

  FluidFramework Client SDK is now built using TypeScript 6. Consumers should build with TypeScript v6 or v7 or compatible tooling.

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

Dependency updates only.

## 2.114.0

Dependency updates only.

## 2.113.0

Dependency updates only.

## 2.112.0

Dependency updates only.

## 2.111.0

Dependency updates only.

## 2.110.0

### Minor Changes

- ITelemetryBaseLogger.minLogLevel may be undefined ([#27546](https://github.com/microsoft/FluidFramework/pull/27546)) [6afb933be51](https://github.com/microsoft/FluidFramework/commit/6afb933be5119722134d3e9c4ca61dfaf8024d8a)

  Typing for `ITelemetryBaseLogger.minLogLevel` is updated to reflect that in some implementations `minLogLevel` is present but evaluates to `undefined`.
  When building with `excactOptionalPropertyTypes:false` as suggested in [compatibility requirements](https://github.com/microsoft/FluidFramework/blob/68732d93a6cc8be2df966b9bb40f58bdd9fad69b/packages/common/core-interfaces/README.md#supported-tools), there is no apparent type change.
  If a type error is experienced, make sure to check for `undefined` or use `?? LogLevel.info` when reading.

## 2.103.0

Dependency updates only.

## 2.102.0

### Minor Changes

- Service client createContainer/getContainer overloads taking CompatibilityMode are deprecated ([#27212](https://github.com/microsoft/FluidFramework/pull/27212)) [3e951b4abf](https://github.com/microsoft/FluidFramework/commit/3e951b4abfc61ea78a3e3e4a891e34e374c76efb)

  The `createContainer` and `getContainer` overloads on `AzureClient`, `OdspClient`, and `TinyliciousClient` (plus `AzureClient.viewContainerVersion`) that accept a [`CompatibilityMode`](https://fluidframework.com/docs/api/fluid-static/compatibilitymode-typealias) (`"1"` / `"2"`) argument are now deprecated.
  Pass a [`MinimumVersionForCollab`](https://fluidframework.com/docs/api/runtime-definitions/minimumversionforcollab-typealias) SemVer string instead — it specifies the minimum collaborating client version directly.

  See [issue #23289](https://github.com/microsoft/FluidFramework/issues/23289) for migration details and removal tracking.

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

Dependency updates only.

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

### Minor Changes

- ITokenClaims and ScopeType re-exports have been removed ([#24530](https://github.com/microsoft/FluidFramework/pull/24530)) [665a9f4b1b](https://github.com/microsoft/FluidFramework/commit/665a9f4b1b412883c0666c5a0818c3f2d054daef)

  Import from `@fluidframework/driver-definitions/legacy` as needed. See issue [#23702](https://github.com/microsoft/FluidFramework/issues/23702).

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

### Minor Changes

- ITokenClaims and ScopeType types are now deprecated ([#23703](https://github.com/microsoft/FluidFramework/pull/23703)) [f679945775](https://github.com/microsoft/FluidFramework/commit/f67994577597aae6dc8b42f3c6557c744adc0964)

  The `ITokenClaims` and `ScopeType` types in `@fluidframework/azure-client` are now deprecated. These were isolated types
  re-exported for convenience but they do not directly interact with typical azure-client APIs.

  See [issue #23702](https://github.com/microsoft/FluidFramework/issues/23702) for details and alternatives.

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

- Update to TypeScript 5.4 ([#21214](https://github.com/microsoft/FluidFramework/pull/21214)) [0e6256c722](https://github.com/microsoft/FluidFramework/commit/0e6256c722d8bf024f4325bf02547daeeb18bfa6)

  Update package implementations to use TypeScript 5.4.5.

- azure-client, tinylicious-client: compatibilityMode parameter added to createContainer and getContainer on AzureClient and TinyliciousClient ([#20997](https://github.com/microsoft/FluidFramework/pull/20997)) [2730787209](https://github.com/microsoft/FluidFramework/commit/2730787209a60155752d51da3c78cf97e1b5f3f9)

  To support migration from 1.x to 2.0, a compatibility mode parameter has been added to these methods on AzureClient and TinyliciousClient. When set to "1", this allows interop between the 2.0 clients and 1.x clients. When set to "2", interop with 1.x clients is disallowed but new 2.0 features may be used.

## 2.0.0-rc.4.0.0

### Minor Changes

- Rename `AzureMember.userName` to `AzureMember.name` and `IMember.userId` to `IMember.id` [96872186d0](https://github.com/microsoft/FluidFramework/commit/96872186d0d0f245c1fece7d19b3743e501679b6)
  1. Renamed `AzureMember.userName` to `AzureMember.name` to establish uniform naming across odsp-client and azure-client.
  2. Renamed `IMember.userId` to `IMember.id` to align with the properties received from AFR.

- copyContainer API replaced by the viewContainerVersion API [96872186d0](https://github.com/microsoft/FluidFramework/commit/96872186d0d0f245c1fece7d19b3743e501679b6)

  The copyContainer API has been removed in favor of the viewContainerVersion API. viewContainerVersion does not automatically produce a new container, but instead retrieves the existing container version for reading only. To produce a new container with the data, use the normal createContainer API surface and write the data prior to attaching it.

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

Dependency updates only.

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

- azure-client: Removed deprecated FluidStatic classes [9a451d4946](https://github.com/microsoft/FluidFramework/commits/9a451d4946b5c51a52e4d1ab5bf51e7b285b0d74)

  Several FluidStatic classes were unnecessarily exposed and were deprecated in an earlier release. They have been replaced with creation functions. This helps us
  keep implementations decoupled from usage which is easier to maintain and extend. It has very minimal impact on the
  public surface area of downstream packages. The removed classes are as follows:
  - `AzureAudience` (use `IAzureAudience` instead)
  - `TinyliciousAudience` (use `ITinyliciousAudience` instead)
  - `DOProviderContainerRuntimeFactory`
  - `FluidContainer`
  - `ServiceAudience`

## 2.0.0-internal.7.4.0

### Minor Changes

- azure-client: Deprecated FluidStatic Classes ([#18402](https://github.com/microsoft/FluidFramework/issues/18402)) [589ec39de5](https://github.com/microsoft/FluidFramework/commits/589ec39de52116c7f782319e6f6aa61bc5aa9964)

  Several FluidStatic classes were unnecessarily exposed. They have been replaced with creation functions. This helps us
  keep implementations decoupled from usage which is easier to maintain and extend. It has very minimal impact on the
  public surface area of downstream packages. The deprecated classes are as follows:
  - `AzureAudience` (use `IAzureAudience` instead)
  - `TinyliciousAudience` (use `ITinyliciousAudience` instead)
  - `DOProviderContainerRuntimeFactory`
  - `FluidContainer`
  - `ServiceAudience`

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

### Minor Changes

- Feature: Gated experimental features ([#15029](https://github.com/microsoft/FluidFramework/pull-requests/15029)) [fc74ff201a](https://github.com/microsoft/FluidFramework/commits/fc74ff201a738a44c42fdc91323d8469ec6a50f2)

  You can now opt in to experimental Fluid Framework features when using `AzureClient`.
