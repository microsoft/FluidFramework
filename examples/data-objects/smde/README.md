# @fluid-example/smde

An experimental implementation of how to take the open source [SimpleMDE](https://simplemde.com/) markdown editor and
enable real-time coauthoring using the Fluid Framework.

<!-- AUTO-GENERATED-CONTENT:START (GET_STARTED) -->
<!-- This section is automatically generated.
To update it, edit docs/md-magic.config.js  then run 'npm run build:md-magic' in the docs folder. -->

## Getting Started

You can run this example using the following steps:

1. Run `npm install` and `npm run build:fast -- --nolint` from the `FluidFramework` root directory.
    - For an even faster build, you can add the package name to the build command, like this:
      `npm run build:fast -- --nolint @fluid-example/smde`
1. Run `npm run start` from this directory (examples/data-objects/smde) and open <http://localhost:8080> in a web browser to see the app running.

<!-- AUTO-GENERATED-CONTENT:END -->

## Data model

SimpleMDE uses the following distributed data structures:

- SharedMap - root
- SharedString - storing SimpleMDE text
