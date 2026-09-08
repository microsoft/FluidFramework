# @fluidframework/id-compressor

## 3.0.0

### Minor Changes

- Removal of direct CommonJS support ([#28124](https://github.com/microsoft/FluidFramework/pull/28124)) [0f84e3b8878](https://github.com/microsoft/FluidFramework/commit/0f84e3b8878a5e75b2253976d98fd963bbd9db88)

  Direct `require()` import is no longer directly supported.
  Package is transpiled as ECMAScript Module.

  See [Removal of direct CommonJS support in v3.0](https://github.com/microsoft/FluidFramework/issues/27444) for more information.

- Require modern TypeScript module resolution ([#27970](https://github.com/microsoft/FluidFramework/pull/27970)) [325e2016ca9](https://github.com/microsoft/FluidFramework/commit/325e2016ca9978d4a1f7552c97ba34feac9df41f)

  Fluid Framework Client packages no longer include type declaration compatibility entrypoints for TypeScript's legacy Node10 resolution mode (`"moduleResolution": "node"` or `"node10"`).
  Applications upgrading to Fluid Framework 3.0 must use one of the following supported configurations:
  - `"module": "Node16"` with `"moduleResolution": "Node16"`
  - `"module": "NodeNext"` with `"moduleResolution": "NodeNext"`
  - `"module": "ESNext"` with `"moduleResolution": "Bundler"`

  Existing public package entrypoints exposed through `package.json` exports, including `/alpha`, `/beta`, and `/legacy`, remain available under supported module resolution modes.

  See [Removal of Node10 resolutions in v3.0](https://github.com/microsoft/FluidFramework/issues/27457) for more information.

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

Dependency updates only.

## 2.115.0

Dependency updates only.

## 2.114.0

Dependency updates only.

## 2.113.0

Dependency updates only.

## 2.112.0

Dependency updates only.

## 2.111.0

### Minor Changes

- Add originatorless normalization for op-space IDs in id-compressor ([#27367](https://github.com/microsoft/FluidFramework/pull/27367)) [4af409440ad](https://github.com/microsoft/FluidFramework/commit/4af409440adc8667c786b8989dbd8d8b8618bc02)

  `IIdCompressor` now includes `tryNormalizeToSessionSpaceWithoutSession(id)`.
  This API supports recovery scenarios where an [op-space identifier](https://fluidframework.com/docs/api/id-compressor/opspacecompressedid-typealias) must be decoded
  without the originating session id.

  For finalized IDs, the method returns the correct session-space form.
  For non-final IDs, it returns `undefined` to indicate that originator context is
  required and callers should use `normalizeToSessionSpace(id, originSessionId)` when
  that context is available.

  ```typescript
  const maybeSessionId =
    idCompressor.tryNormalizeToSessionSpaceWithoutSession(opId);
  if (maybeSessionId === undefined) {
    const sessionId = idCompressor.normalizeToSessionSpace(opId, originatorId);
    // use sessionId
  } else {
    // use maybeSessionId
  }
  ```

  `IIdCompressor` is now marked `@sealed`.
  Fluid already assumed any `IIdCompressor` was its own implementation and casted them internally.
  Any custom implementations will no longer build due to the above change,
  but would not have worked at runtime anyway.
  The updated tagging now correctly documents this requirement.

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

- Remove IIdCompressorCore from legacy API surface ([#27146](https://github.com/microsoft/FluidFramework/pull/27146)) [a0d3a13888a](https://github.com/microsoft/FluidFramework/commit/a0d3a13888ae9020e1a4231f4c3ff810b6aaac19)

  The `IIdCompressorCore` interface has been removed from the `@legacy` API surface and is now `@internal`.
  This was previously deprecated in 2.92.0.

  The return types of `createIdCompressor` and `deserializeIdCompressor` have been narrowed from `IIdCompressor & IIdCompressorCore` to `IIdCompressor`.

  #### Migration
  - **`serialize()`**:
    Use the `serializeIdCompressor(compressor, withSession)` free function instead of calling `compressor.serialize(withSession)` directly.
  - **`takeNextCreationRange()`, `takeUnfinalizedCreationRange()`, `finalizeCreationRange()`, `beginGhostSession()`**:
    These are internal runtime operations that should not be called by external consumers.
    If you depend on these APIs, please file an issue on the FluidFramework repository describing your use case.
  - **Return types of `createIdCompressor` / `deserializeIdCompressor`**:
    Type your variables as `IIdCompressor` rather than `IIdCompressor & IIdCompressorCore`.

## 2.93.0

Dependency updates only.

## 2.92.0

### Minor Changes

- Deprecate IIdCompressorCore interface ([#26865](https://github.com/microsoft/FluidFramework/pull/26865)) [2e890f6416](https://github.com/microsoft/FluidFramework/commit/2e890f64160736b4e5efda0791f91bea96c5a011)

  The `IIdCompressorCore` interface is deprecated and will be removed from the public API surface in 2.100.0. This also affects the return types of `createIdCompressor` and `deserializeIdCompressor`, which currently return `IIdCompressor & IIdCompressorCore` but will be narrowed to `IIdCompressor`.

  #### Migration
  - **`serialize()`**: Use the new `serializeIdCompressor(compressor, withSession)` free function instead of calling `compressor.serialize(withSession)` directly.
  - **`takeNextCreationRange()`, `takeUnfinalizedCreationRange()`, `finalizeCreationRange()`, `beginGhostSession()`**: These are internal runtime operations that should not be called by external consumers. If you depend on these APIs, please file an issue on the FluidFramework repository describing your use case.
  - **Return types of `createIdCompressor` / `deserializeIdCompressor`**: Stop relying on the `IIdCompressorCore` portion of the intersection type. Type your variables as `IIdCompressor` instead of `IIdCompressor & IIdCompressorCore`.

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

## 2.0.0-rc.2.0.0

### Minor Changes

- id-compressor: Deprecated ID compressor class has been removed from the public API. ([#19054](https://github.com/microsoft/FluidFramework/issues/19054)) [46a05617b2](https://github.com/microsoft/FluidFramework/commits/46a05617b2a42bf2763e49e4ccddd3ee8df9c05d)

  This change should be a no-op for consumers, as there were already better static creation/deserialization functions for use and compressor types are generally unused outside the runtime.

## 2.0.0-rc.1.0.0

### Minor Changes

- id-compressor: Cluster allocation strategy updated ([#19066](https://github.com/microsoft/FluidFramework/issues/19066)) [0c36eb5f53](https://github.com/microsoft/FluidFramework/commits/0c36eb5f539362a8e27982e831a3ffe7999c1478)

  This change adjusts the cluster allocation strategy for ghost sessions to exactly fill the cluster instead of needlessly allocating a large cluster.
  It will also not make a cluster at all if IDs are not allocated.
  This change adjusts a computation performed at a consensus point, and thus breaks any sessions collaborating across version numbers.
  The version for the serialized format has been bumped to 2.0, and 1.0 documents will fail to load with the following error:
  IdCompressor version 1.0 is no longer supported.

## 2.0.0-internal.8.0.0

Dependency updates only.

## 2.0.0-internal.7.4.0
