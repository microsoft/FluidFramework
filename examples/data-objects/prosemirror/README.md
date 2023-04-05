# @fluid-example/prosemirror

An experimental implementation of how to take the open source [ProseMirror](https://prosemirror.net/) rich text editor and
enable real-time coauthoring using the Fluid Framework.

<!-- AUTO-GENERATED-CONTENT:START (README_EXAMPLE_GETTING_STARTED_SECTION:usesTinylicious=FALSE) -->

<!-- prettier-ignore-start -->
<!-- NOTE: This section is automatically generated using @fluid-tools/markdown-magic. Do not update these generated contents directly. -->

## Getting Started

You can run this example using the following steps:

1. Enable [corepack](https://nodejs.org/docs/latest-v16.x/api/corepack.html) by running `corepack enable`.
1. Run `pnpm install` and `pnpm run build:fast --nolint` from the `FluidFramework` root directory.
    - For an even faster build, you can add the package name to the build command, like this:
      `pnpm run build:fast --nolint @fluid-example/prosemirror`
1. Run `pnpm start` from this directory and open <http://localhost:8080> in a web browser to see the app running.

<!-- prettier-ignore-end -->

<!-- AUTO-GENERATED-CONTENT:END -->

## Data model

ProseMirror uses the following distributed data structures:

-   SharedDirectory - root
-   SharedString - storing ProseMirror text

## Known Issues

This implementation stores the HTML output of the ProseMirror editor onto the SharedString. While this enables
collaboration it does not provide for a complete editor. Because rich editing features (ex. bold/italic) are stored
as HTML tags along with the text this can cause conflicts with multiple users applying conflicting styles resulting
in lost opening/closure tags.

A more complete solution would use the SharedString property bag to apply styles across text ranges. This allows for
styles to be merged in a more deterministic way.
