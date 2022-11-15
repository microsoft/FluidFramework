# @fluid-example/prosemirror

An experimental implementation of how to take the open source [ProseMirror](https://prosemirror.net/) rich text editor and
enable real-time coauthoring using the Fluid Framework.

<!-- AUTO-GENERATED-CONTENT:START (GET_STARTED) -->
<!-- This section is automatically generated.
To update it, edit docs/md-magic.config.js  then run 'npm run build:md-magic' in the docs folder. -->

## Getting Started

You can run this example using the following steps:

1. Run `npm install` and `npm run build:fast -- --nolint` from the `FluidFramework` root directory.
    - For an even faster build, you can add the package name to the build command, like this:
      `npm run build:fast -- --nolint @fluid-example/prosemirror`
1. Run `npm run start` from this directory (examples/data-objects/prosemirror) and open <http://localhost:8080> in a web browser to see the app running.

<!-- AUTO-GENERATED-CONTENT:END -->

## Data model

ProseMirror uses the following distributed data structures:

- SharedDirectory - root
- SharedString - storing ProseMirror text

## Known Issues

This implementation stores the HTML output of the ProseMirror editor onto the SharedString. While this enables
collaboration it does not provide for a complete editor. Because rich editing features (ex. bold/italic) are stored
as HTML tags along with the text this can cause conflicts with multiple users applying conflicting styles resulting
in lost opening/closure tags.

A more complete solution would use the SharedString property bag to apply styles across text ranges. This allows for
styles to be merged in a more deterministic way.
