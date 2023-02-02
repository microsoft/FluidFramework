# @fluid-tools/client-debugger-chrome-extension

This package contains a browser (Chrome) extension for launching the [Fluid Client visual debugger tooling](https://github.com/microsoft/FluidFramework/tree/main/packages/tools/client-debugger/client-debugger-view) on a page that has invoked our client debug tooling.

## Usage

For now, this package is `private`.
We are not yet publishing any artifacts to the Chrome extension store.

To use this extension in your browser:

1. Build the package and its dependencies.
   Your extension file should be generated under the [appropriate extension variant](#prototype-variants) path under the build directory ("dist") in this package.
2. Load the unpacked extension in the browser by following [these instructions](https://developer.chrome.com/docs/extensions/mv3/getstarted/development-basics/#load-unpacked).
   For the wsl users, your Linux files should be at a \\wsl$ path.
   In File Explorer or any other Windows application that can browse files, navigate to the path: \\wsl$.

## Prototype Variants

This library is still a prototype.
In order to test different extension model approaches we may take, it is split into 3 variants that can be independently installed in your browser.

### Injected Extension

The Injected Extension model was the easiest to implement, but likely not a robust approach to creating a user-friendly extension.

To work around standard Chrome Extension data boundaries, the extension simply launches a script that injects [@fluid-tools/client-debugger-view][] onto the window's source page.
This allows the extension to directly access the shared debugger registry from [@fluid-tools/client-debugger][] without requiring any message passing, but comes with numerous downsides.

To install this extension in the browser, use the generated bundle under `dist/injected-extension`.

#### Pros

-   Minimal extension code (simply leverages our visualizer library)

#### Cons

-   There isn't an obvious way for the extension to know _where_ to embed the visual debugger element on the page, nor when it is required to re-render when a context changes.
-   Violates extension best practices.

### Content Extension

The Content Extension model prototypes a more standard extension approach.
Data must be communicated to and from the window via message passing.

NOTE: This has not been implemented yet.

To install this extension in the browser, use the generated bundle under `dist/content-extension`.

#### Pros

TODO

#### Cons

TODO

### Developer Tools Extension

The Dev-Tools Extension model prototypes how our extension can fit into the Chrome developer tools panel.
Aside from where the visuals appear, this model is very similar to the [Content Extension model](#content-extension).

TODO: differences?

NOTE: This has not been implemented yet.

To install this extension in the browser, use the generated bundle under `dist/dev-tools-extension`.

#### Pros

TODO

#### Cons

TODO

## Package TODOs

-   Inject the debugger view as a sibling next to the page contents, rather than as an overlay on top of it (to ensure all customer content is not obscured by the panel).

<!-- AUTO-GENERATED-CONTENT:START (README_TRADEMARK_SECTION:includeHeading=TRUE) -->

<!-- prettier-ignore-start -->

<!-- This section is automatically generated. To update it, make the appropriate changes to docs/md-magic.config.js or the embedded content, then run 'npm run build:md-magic' in the docs folder. -->

## Trademark

This project may contain Microsoft trademarks or logos for Microsoft projects, products, or services.
Use of these trademarks or logos must follow Microsoft's [Trademark & Brand Guidelines](https://www.microsoft.com/en-us/legal/intellectualproperty/trademarks/usage/general).
Use of Microsoft trademarks or logos in modified versions of this project must not cause confusion or imply Microsoft sponsorship.

<!-- prettier-ignore-end -->

<!-- AUTO-GENERATED-CONTENT:END -->

<!-- Links -->

[@fluid-tools/client-debugger]: https://github.com/microsoft/FluidFramework/tree/main/packages/tools/client-debugger/client-debugger
[@fluidframework/client-debugger-view]: https://github.com/microsoft/FluidFramework/tree/main/packages/tools/client-debugger/client-debugger-view
