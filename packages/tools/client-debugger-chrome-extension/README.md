# @fluid-tools/client-debugger-chrome-extension

This package contains a browser (Chrome) extension for launching the Fluid Client visual debugger tooling on a page that has invoked our client debug tooling (TODO: link to debugger library package).

## Usage

For now, this package is `private`.
We are not yet publishing any artifacts to the Chrome extension store.

To use this extension in your browser:

1. Build the package and its dependencies. Your extension file should be generated under the build directory ("dist") in the package.
2. Load the unpacked extension in the browser by following [these instructions](https://developer.chrome.com/docs/extensions/mv3/getstarted/development-basics/#load-unpacked). For the wsl users, your liunx files should be at a \\wsl$ path. In File Explorer or any other Windows application that can browse files, navigate to the path: \\wsl$

## Package TODOs

-   Use the multi-container visualizer component once it is available, rather than manually looking for debugger instances from this tool.
-   Inject the debugger view as a sibling next to the page contents, rather than as an overlay on top of it (to ensure all customer content is not obscured by the panel).

<!-- AUTO-GENERATED-CONTENT:START (README_TRADEMARK_SECTION:includeHeading=TRUE) -->

## Trademark

This project may contain Microsoft trademarks or logos for Microsoft projects, products, or services.
Use of these trademarks or logos must follow Microsoft's [Trademark & Brand Guidelines](https://www.microsoft.com/en-us/legal/intellectualproperty/trademarks/usage/general).
Use of Microsoft trademarks or logos in modified versions of this project must not cause confusion or imply Microsoft sponsorship.

<!-- AUTO-GENERATED-CONTENT:END -->

<!-- Links -->
