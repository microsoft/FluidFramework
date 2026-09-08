# @fluidframework/odsp-urlresolver

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

- Resolved URLs no longer use non-standard protocols ([#19840](https://github.com/microsoft/FluidFramework/issues/19840)) [9d3d185183](https://github.com/microsoft/FluidFramework/commits/9d3d1851830d953792a6dfad60dde6f1c59480de)

  Previously, `IResolvedUrl.url` could use a non-standard protocol like `fluid://`, `fluid-odsp://`, or `fluid-test://`. These have been replaced with `https://` to permit standards-compliant URL parsing.

- Remove deprecated package @fluid-tools/fluidapp-odsp-urlresolver ([#19262](https://github.com/microsoft/FluidFramework/issues/19262)) [8990be8bbc](https://github.com/microsoft/FluidFramework/commits/8990be8bbc229c6545eb32023f9caa1dcca8568d)

  The FluidAppOdspUrlResolver class is now incorporated into the @fluidframework/odsp-urlresolver package.

## 2.0.0-rc.1.0.0

Dependency updates only.

## 2.0.0-internal.8.0.0

Dependency updates only.

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
