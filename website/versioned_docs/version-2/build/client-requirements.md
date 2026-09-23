---
title: Client Requirements
sidebar_position: 12
---

Fluid Framework version 2 client libraries support the platforms in this document.
These requirements are intentionally restrictive.
Within the version 2 release series, we may relax these requirements, but we will not make them stricter.
For a Long Term Support (LTS) version, we may need to support these platforms for several years.

Other configurations may work, but Fluid Framework does not support them.
If an unsupported configuration stops working, we do not classify this as a bug.
To request support for a configuration that is not listed, file an issue.
The product team will evaluate your request.
In the issue, specify the current status of the configuration:

-   The configuration works but needs official support.
-   The configuration does not work and requires changes.

## Supported Runtimes

-   Fluid Framework supports Node.js version `^22.22.2`.
    -   Fluid Framework will stop support for Node.js 22 [when upstream support ends on 2027-04-30](https://github.com/nodejs/release#release-schedule).
    -   Fluid Framework will support a newer LTS version of Node.js at least one year before support for Node.js 22 ends.
    -   Fluid Framework does not support Node.js with the `--no-experimental-fetch` flag.
-   Fluid Framework supports modern browsers that support the ES2022 standard library.
    -   In response to user requests, we can add support for Babel polyfills that target specific standards or runtimes.
    -   We can avoid or remove APIs that cannot be polyfilled reliably.
    -   Otherwise, we target modern standards.

## Supported Tools

-   TypeScript 5.4:
    -   Fluid Framework supports all [`strict`](https://www.typescriptlang.org/tsconfig) options.
    -   Enable [`strictNullChecks`](https://www.typescriptlang.org/tsconfig).
    -   Fluid Framework does not support [configuration options deprecated in TypeScript 5.0](https://github.com/microsoft/TypeScript/issues/51909).
    -   Fluid Framework does not fully support `exactOptionalPropertyTypes`.
        If you enable this option, do not use `in`, `Reflect.has`, `Object.hasOwn`, or `Object.prototype.hasOwnProperty` to narrow members of Fluid Framework types.
        These methods can incorrectly exclude `undefined` from the possible values.
-   [webpack](https://webpack.js.org/) 5
    -   We do not require a specific bundler.
        Other bundlers that handle ES Modules can work, but we actively test only webpack.

## Module Resolution

In TypeScript `compilerOptions`, use [`Node16`, `NodeNext`, or `Bundler`](https://www.typescriptlang.org/tsconfig#moduleResolution) module resolution.
These settings follow the [Node.js v12+ ESM Resolution and Loading algorithm](https://nodejs.github.io/nodejs.dev/en/api/v20/esm/#resolution-and-loading-algorithm).

Do not use `Node10` module resolution.
It does not support the Fluid Framework API structure that separates stable APIs from APIs that are in development.

## Module Formats

-   ES Modules:
    Use ES Modules to consume Fluid Framework client packages, including in Node.js.
-   CommonJS:
    Fluid Framework supports CommonJS only in Node.js and only for testing with Jest.
    Jest does not have [stable ES Module support](https://jestjs.io/docs/ecmascript-modules) because it uses [unstable Node.js APIs](https://github.com/nodejs/node/issues/37648).
    To request support for another CommonJS workflow, file an issue.
    When no supported workflow requires CommonJS, we can stop CommonJS support one year after we publish notice of the change.
