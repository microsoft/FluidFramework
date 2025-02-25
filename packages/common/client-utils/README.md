# @fluid-internal/client-utils

This package is intended for sharing and promoting utility functions across packages in the Fluid Framework repo,
primarily within the client release group.

<!-- AUTO-GENERATED-CONTENT:START (LIBRARY_README_HEADER) -->

<!-- prettier-ignore-start -->
<!-- NOTE: This section is automatically generated using @fluid-tools/markdown-magic. Do not update these generated contents directly. -->

**IMPORTANT: This package is intended strictly as an implementation detail of the Fluid Framework and is not intended for public consumption.**
**We make no stability guarantees regarding its APIs.**

<!-- prettier-ignore-end -->

<!-- AUTO-GENERATED-CONTENT:END -->

## Adding code to this package

As a utility package, this package does not have a strong identity. This means that it's easy to become a "dumping
ground" for code that we think we should share but doesn't have an obvious home. We try to avoid dumping things into
utility packages, and this one is no exception.

New code should only be added to this package in rare circumstances. In most cases, the code would be better placed in a
package with a clear identity (e.g. an "events" package for shared event infrastructure) or not shared at all.

## Requirements

This package has important requirements for the code within it.

1. Code within this package should require some external dependencies. If it does not, then the **core-utils** package
   is a better location.
1. **All exports must be designated `@internal`.** This code is intended for use within the Fluid Framework only.
   **Excepting the small set of typed event emitter APIs** that are in use by legacy test support.
1. This package should **only contain 'implementation' code, not type definitions.** This is the most flexible rule, and
   there are some exceptions. If the type is _only_ necessary when using this package, then it is probably OK. However,
   usually such types would be better placed in core-interfaces or in a package that corresponds to the purpose.

If you want to add code that does not meet these requirements, these other packages may be a better choice:

-   **Types and interfaces** that are intended to be broadly shared across the client release group should be put in the
    **core-interfaces** package.
-   **Zero-dependency shared code** should be put in the **core-utils** package.

## Isomorphic Code

One of the primary reasons for this package's existence is to provide isomorphic implementations of
Buffer and related utilities that work in both browser and Node.js environments.

Our general strategy for this is as follows:

-   We use the export map in package.json to provide different entrypoints for browser (indexBrowser.js)
    vs. Node.js (indexNode.js).

-   Because the browser ecosystem is more complex (bunders, etc.), we improve our odds of success by making
    the browser the default. Only Node.js relies on remapping via the export map.

-   We further simplify things by only using the export map to resolve the initial entrypoint. We do not
    rely on export maps to remap imports within the module. (Basically, the browser / node.js specific
    implementations fork at the entrypoint and from that point on explicitly import browser or node
    specific files.)

One thing it is important to be aware of is that our CJS support relies on copying a stub package.json
file to dist/package.json to set the module type to commonjs. When resolving internal imports for CJS
packages, module resolution will walk up from the \*.js file and discover this stub package.json. Because
the stub package.json lacks an export map, internal imports will not be remapped.

## Export Reports and Linting

With the current case of legacy APIs that are present here and the isometric browser and Node.js support,
generation and checking of APIs is unique within client group. `lib/client-utils.(browser|node).*.d.ts` files
are generated but not used in production (excluded from npm package).

For local (development) builds browser reports are generated first and Node.js reports are then verified to
be the same as browser. (Both report sets use the same target files.)

Package scripts `check:exports:esm:indexBrowser:legacy` and `check:exports:esm:indexNode:legacy` are not
verifying actual exports, but the consistency of tags within the legacy API set.

<!-- AUTO-GENERATED-CONTENT:START (README_FOOTER) -->

<!-- prettier-ignore-start -->
<!-- NOTE: This section is automatically generated using @fluid-tools/markdown-magic. Do not update these generated contents directly. -->

## Contribution Guidelines

There are many ways to [contribute](https://github.com/microsoft/FluidFramework/blob/main/CONTRIBUTING.md) to Fluid.

-   Participate in Q&A in our [GitHub Discussions](https://github.com/microsoft/FluidFramework/discussions).
-   [Submit bugs](https://github.com/microsoft/FluidFramework/issues) and help us verify fixes as they are checked in.
-   Review the [source code changes](https://github.com/microsoft/FluidFramework/pulls).
-   [Contribute bug fixes](https://github.com/microsoft/FluidFramework/blob/main/CONTRIBUTING.md).

Detailed instructions for working in the repo can be found in the [Wiki](https://github.com/microsoft/FluidFramework/wiki).

This project has adopted the [Microsoft Open Source Code of Conduct](https://opensource.microsoft.com/codeofconduct/).
For more information see the [Code of Conduct FAQ](https://opensource.microsoft.com/codeofconduct/faq/) or contact [opencode@microsoft.com](mailto:opencode@microsoft.com) with any additional questions or comments.

This project may contain Microsoft trademarks or logos for Microsoft projects, products, or services.
Use of these trademarks or logos must follow Microsoft’s [Trademark & Brand Guidelines](https://www.microsoft.com/trademarks).
Use of Microsoft trademarks or logos in modified versions of this project must not cause confusion or imply Microsoft sponsorship.

## Help

Not finding what you're looking for in this README? Check out [fluidframework.com](https://fluidframework.com/docs/).

Still not finding what you're looking for? Please [file an issue](https://github.com/microsoft/FluidFramework/wiki/Submitting-Bugs-and-Feature-Requests).

Thank you!

## Trademark

This project may contain Microsoft trademarks or logos for Microsoft projects, products, or services.

Use of these trademarks or logos must follow Microsoft's [Trademark & Brand Guidelines](https://www.microsoft.com/en-us/legal/intellectualproperty/trademarks/usage/general).

Use of Microsoft trademarks or logos in modified versions of this project must not cause confusion or imply Microsoft sponsorship.

<!-- prettier-ignore-end -->

<!-- AUTO-GENERATED-CONTENT:END -->
