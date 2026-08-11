<!-- AUTO-GENERATED-CONTENT:START (LIBRARY_README_HEADER:packageJsonPath=./package.json&devDependency=TRUE&scripts=TRUE&packageScopeNotice=EXPERIMENTAL) -->

<!-- prettier-ignore-start -->
<!-- NOTE: This section is automatically generated using @fluid-tools/markdown-magic. Do not update these generated contents directly. -->

**IMPORTANT: This package is experimental.**
**Its APIs may change without notice.**

**Do not use in production scenarios.**

## Using Fluid Framework libraries

When taking a dependency on a Fluid Framework library's public APIs, we recommend using a `^` (caret) version range, such as `^1.3.4`.
While Fluid Framework libraries may use different ranges with interdependencies between other Fluid Framework libraries,
library consumers should always prefer `^`.

If using any of Fluid Framework's unstable APIs (for example, its `beta` APIs), we recommend using a more constrained version range, such as `~`.

## Installation

To get started, install the package by running the following command:

```bash
npm i @fluidframework/test-package -D
```

## Importing from this package

This package leverages [package.json exports](https://nodejs.org/api/packages.html#exports) to separate its APIs by support level.
For more information on the related support guarantees, see [API Support Levels](https://fluidframework.com/docs/build/releases-and-apitags/#api-support-levels).

To access the `public` ([SemVer](https://semver.org/)) APIs, import via `@fluidframework/test-package` like normal.

To access the `alpha` APIs, import via `@fluidframework/test-package/alpha`.

To access the `legacy` APIs, import via `@fluidframework/test-package/legacy`.

## API Documentation

API documentation for **@fluidframework/test-package** is available at <https://fluidframework.com/docs/apis/test-package>.

<!-- prettier-ignore-end -->

<!-- AUTO-GENERATED-CONTENT:END -->
