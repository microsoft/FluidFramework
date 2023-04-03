# @fluid-example/codemirror

An experimental implementation of how to take the open source [CodeMirror](https://codemirror.net/) code editor
and enable real-time coauthoring using the Fluid Framework.

<!-- AUTO-GENERATED-CONTENT:START (README_EXAMPLE_GETTING_STARTED_SECTION:usesTinylicious=FALSE) -->

<!-- prettier-ignore-start -->
<!-- NOTE: This section is automatically generated using @fluid-tools/markdown-magic. Do not update these generated contents directly. -->

## Getting Started

You can run this example using the following steps:

1. Install [pnpm](https://pnpm.io/) by running `npm i -g pnpm@7`.
1. Run `pnpm install` and `npm run build:fast -- --nolint` from the `FluidFramework` root directory.
    - For an even faster build, you can add the package name to the build command, like this:
      `npm run build:fast -- --nolint @fluid-example/codemirror`
1. Run `npm start` from this directory and open <http://localhost:8080> in a web browser to see the app running.

<!-- prettier-ignore-end -->

<!-- AUTO-GENERATED-CONTENT:END -->

## Data model

CodeMirror uses the following distributed data structures:

-   SharedDirectory - root
-   SharedString - storing codemirror text

## Known issues

[#1157 - Presence in CodeMirror is not always correct](https://github.com/microsoft/FluidFramework/issues/1157)
