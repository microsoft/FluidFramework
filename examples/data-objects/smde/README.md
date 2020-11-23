# @fluid-example/smde

An experimental implementation of how to take the open source [SimpleMDE](https://simplemde.com/) markdown editor and
enable real-time coauthoring using the Fluid Framework.

<!-- AUTO-GENERATED-CONTENT:START (GET_STARTED) -->
<!-- The getting started instructions are automatically generated.
To update them, edit md-magic.config.js in the root of the repo, then run npm run readme:update -->

## Getting Started

You can run this example using the following steps:

1. Run `npm install` and `npm run build:fast -- --nolint` from the `FluidFramework` root directory.
   a. For an even faster build, you can add the package name to the build command, like this:
      `npm run build:fast -- --nolint @fluid-example/smde`
1. Navigate to this directory (examples/data-objects/smde).
1. Run `npm run start`.
<!-- AUTO-GENERATED-CONTENT:END -->

## Data model

SimpleMDE uses the following distributed data structures:

- SharedMap - root
- SharedString - storing SimpleMDE text
