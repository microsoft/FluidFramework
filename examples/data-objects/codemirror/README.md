# @fluid-example/codemirror

An experimental implementation of how to take the open source [CodeMirror](https://codemirror.net/) code editor
and enable real-time coauthoring using the Fluid Framework.

<!-- AUTO-GENERATED-CONTENT:START (GET_STARTED) -->
<!-- The getting started instructions are automatically generated.
To update them, edit markdown.config.js and run npm run readme:update in the root of the repo -->

## Getting Started

You can run this example using the following steps:

1. Run `npm install` and `npm run build:fast -- --nolint` from the `FluidFramework` root directory.
   a. For an even faster build, you can add the package name to the build command, like this:
      `npm run build:fast -- --nolint @fluid-example/codemirror`
1. Navigate to this directory (examples/data-objects/codemirror).
1. Run `npm run start`.
<!-- AUTO-GENERATED-CONTENT:END -->

## Data model

CodeMirror uses the following distributed data structures:

- SharedDirectory - root
- SharedString - storing codemirror text

## Known issues

[#1157 - Presence in CodeMirror is not always correct](https://github.com/microsoft/FluidFramework/issues/1157)
