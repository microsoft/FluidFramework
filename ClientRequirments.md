# Platform Requirements for Fluid Framework Client Packages

These are the platform requirements for the current version of Fluid Framework Client Packages.
These are intentionally quite strict as they have to be supported for the entire Long Term Support (LTS) timeline for LTS versions.
These restrictions can be loosened over time, adding support for specific configurations desired by users of the client packages.

It is likely that other configurations will work, but as they are not supported, if they stop working, that is not a breaking change.
If you would benefit from support for something not listed here, file an issue and the product team will evaluate your request.
When making such a request please include if such a configuration already works (and thus the request is just that it becomes officially supported), or if changes are required to get it working.

## Supported Runtimes

-   NodeJs ^20.10.0 except that we will drop support for it [when NodeJs 20 loses its upstream support on 2026-04-30](https://github.com/nodejs/release#release-schedule), and will support a newer LTS version of NodeJS (22) at least 1 year before 20 is end of life. This same policy applies to NodeJS 22 when it is end of life (2027-04-30).
-   Modern browsers supporting the es2022 standard library: in response to asks we can add explicit support for using babel to polyfill to target specific standards or runtimes (meaning we can avoid/remove use of things that don't polyfill robustly, but otherwise target modern standards).

## Supported Tools

-   TypeScript 5.4:
    -   All [`strict`](https://www.typescriptlang.org/tsconfig) options are supported.
    -   [`strictNullChecks`](https://www.typescriptlang.org/tsconfig) is required.
    -   ["Backwards Compatibility"](https://www.typescriptlang.org/tsconfig) options are not supported.
    -   TODO: "Interop Constraints" requirements.
-   [webpack](https://webpack.js.org/) 5:
    -   TODO: list requirements to make our client packages work with webpack (ex: what polyfills we need, etc.). Maybe we should publish a supported know to work config (ex: fully working source maps, all needed polyfills) which we can update as part of the client packages?

## Module Formats

-   ES Modules:
    ES Modules are the preferred way to consume our client packages (including in NodeJs) and consuming our client packages from ES Modules is fully supported.
    TODO: details. Module resolution etc?
-   CommonJs:
    Consuming our client packages as CommonJs is supported only in NodeJS and only for development and testing. This is done to accommodate some workflows without good ES Module support.
    These workflows are listed below.
    If you have a workflow you would like included in this list, file an issue.
    Once this list of workflows motivating CommonJS support is empty, we may drop support for CommonJS one year of notice of the change is posted here.

    -   Testing with Jest (Which lacks [stable ESM support](https://jestjs.io/docs/ecmascript-modules) due to [unstable APIs in NodeJs](https://github.com/nodejs/node/issues/37648))
