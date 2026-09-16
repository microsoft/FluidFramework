# @fluidframework/quill-react

## 3.0.0

### Minor Changes

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

### Minor Changes

- Fix extra blank lines in collaborating Quill editors ([#27809](https://github.com/microsoft/FluidFramework/pull/27809)) [6af2aba044](https://github.com/microsoft/FluidFramework/commit/6af2aba044e050b20386ae9e67111693117da5bd)

  Quill React bindings now distinguish Quill's required terminal newline from user-authored content. Remote editors no longer render an extra blank paragraph after text or line-formatting changes, while intentional trailing line breaks remain synchronized.

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
