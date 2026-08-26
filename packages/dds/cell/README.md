# @fluidframework/cell

The `SharedCell` Distributed Data Structure (DDS) stores a single, shared value that can be edited or deleted.

This package is primarily intended as a minimal example of how distributed data structures work.
For real-world scenarios, we recommend using one of our other DDSs, like [SharedTree](https://fluidframework.com./docs/data-structures/tree/).

<!-- AUTO-GENERATED-CONTENT:START (LIBRARY_README_HEADER:) -->

<!-- prettier-ignore-start -->
<!-- NOTE: This section is automatically generated using @fluid-tools/markdown-magic. Do not update these generated contents directly. -->

## Using Fluid Framework libraries

For a dependency on a Fluid Framework library's public APIs, we recommend a `^` (caret) version range.
For example, use `^1.3.4`.

For a dependency on an unstable API, such as a `beta` API, we recommend a more restrictive version range.
For example, use a `~` version range.

## Installation

Run this command to install the package:

```bash
npm i @fluidframework/cell
```

## API Documentation

Read the **@fluidframework/cell** API documentation at <https://fluidframework.com/docs/apis/cell>.

<!-- prettier-ignore-end -->

<!-- AUTO-GENERATED-CONTENT:END -->

<!-- AUTO-GENERATED-CONTENT:START (README_FOOTER:) -->

<!-- prettier-ignore-start -->
<!-- NOTE: This section is automatically generated using @fluid-tools/markdown-magic. Do not update these generated contents directly. -->

## Minimum Client Requirements

Fluid Framework client libraries support the platforms in this document.
These requirements are intentionally restrictive.
Within a major version series, we can relax these requirements, but we cannot make them stricter.
For a Long Term Support (LTS) version, we might need to support these platforms for several years.

Other configurations can work, but Fluid Framework does not support them.
If an unsupported configuration stops working, we do not classify this as a bug.
To request support for a configuration that is not listed, file an issue.
The product team will evaluate your request.
In the issue, specify the current status of the configuration:

-   The configuration works but needs official support.
-   The configuration does not work and requires changes.

### Supported Runtimes

-   Fluid Framework supports Node.js versions 22 and 24 while they receive [upstream support](https://nodejs.org/en/about/previous-releases).
    -   Fluid Framework will stop support for version 22 [when upstream support ends on 2027-04-30](https://github.com/nodejs/release#release-schedule).
    -   Fluid Framework does not support Node.js with the `--no-experimental-fetch` flag.
-   Fluid Framework supports modern browsers that support the ES2022 standard library.

### Supported Tools

-   [TypeScript 6.0](https://typescriptdocs.com/release-notes/TypeScript%206.0):
    -   Fluid Framework supports all [`strict`](https://www.typescriptlang.org/tsconfig) options.
    -   Set the build targets (`lib`, `target`) to `ES2022` or later.
    -   Enable [`strictNullChecks`](https://www.typescriptlang.org/tsconfig).
    -   Fluid Framework does not support [configuration options deprecated in TypeScript 6.0](https://typescriptdocs.com/release-notes/TypeScript%206.0#breaking-changes-and-deprecations-in-typescript-6-0).
    -   Fluid Framework does not fully support `exactOptionalPropertyTypes`.
        If you enable this option, do not use `in`, `Reflect.has`, `Object.hasOwn`, or `Object.prototype.hasOwnProperty` to narrow members of Fluid Framework types.
        These methods can incorrectly exclude `undefined` from the possible values.
-   [webpack](https://webpack.js.org/) 5
    -   We do not require a specific bundler.
        Other bundlers that handle ES Modules can work, but we actively test only webpack.

### Module Resolution

In TypeScript `compilerOptions`, use [`Node16`, `Node20`, `NodeNext`, or `Bundler`](https://www.typescriptlang.org/tsconfig#moduleResolution) module resolution.
These settings follow the [Node.js v12+ ESM Resolution and Loading algorithm](https://nodejs.github.io/nodejs.dev/en/api/v20/esm/#resolution-and-loading-algorithm).

Do not use `Node10` module resolution.

### Module Formats

-   ES Modules:
    Use ES Modules to consume Fluid Framework client packages, including in Node.js.
-   CommonJS:
    Fluid Framework does not officially support CommonJS in version 3.0 or later.

## Contribution Guidelines

You can [contribute](https://github.com/microsoft/FluidFramework/blob/main/CONTRIBUTING.md) to Fluid Framework in these ways:

-   Answer questions in [GitHub Discussions](https://github.com/microsoft/FluidFramework/discussions).
-   [Submit bug reports](https://github.com/microsoft/FluidFramework/issues) and help verify fixes.
-   Review [source code changes](https://github.com/microsoft/FluidFramework/pulls).
-   [Contribute bug fixes](https://github.com/microsoft/FluidFramework/blob/main/CONTRIBUTING.md).

For detailed instructions, read the [Fluid Framework wiki](https://github.com/microsoft/FluidFramework/blob/main/docs/content/Home.md).

This project follows the [Microsoft Open Source Code of Conduct](https://opensource.microsoft.com/codeofconduct/).
For more information, read the [Code of Conduct frequently asked questions](https://opensource.microsoft.com/codeofconduct/faq/).
For questions or comments, contact [opencode@microsoft.com](mailto:opencode@microsoft.com).

This project may contain Microsoft trademarks or logos for Microsoft projects, products, or services.
When you use these trademarks or logos, follow Microsoft's [Trademark and Brand Guidelines](https://www.microsoft.com/trademarks).
Do not use Microsoft trademarks or logos in a modified version of this project if the use causes confusion or implies Microsoft sponsorship.

## Help

Read the [Fluid Framework documentation](https://fluidframework.com/docs/) for information about Fluid Framework concepts and APIs.

To request information that the documentation does not contain, [create an issue](https://github.com/microsoft/FluidFramework/blob/main/docs/content/Contributing/Submitting-Bugs-and-Feature-Requests.md).

## Trademark

This project may contain Microsoft trademarks or logos for Microsoft projects, products, or services.

Use of these trademarks or logos must follow Microsoft's [Trademark & Brand Guidelines](https://www.microsoft.com/en-us/legal/intellectualproperty/trademarks/usage/general).

Use of Microsoft trademarks or logos in modified versions of this project must not cause confusion or imply Microsoft sponsorship.

<!-- prettier-ignore-end -->

<!-- AUTO-GENERATED-CONTENT:END -->
