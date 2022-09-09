# @fluid-example/table-view

**Table View** is a basic table/grid view built on top of the `@fluid-example/table-document` data object.
Since Table View uses the data model provided by Table Document it only uses it's DDS to store a reference
to the created Table Document.

<!-- AUTO-GENERATED-CONTENT:START (GET_STARTED) -->
<!-- This section is automatically generated.
To update it, edit docs/md-magic.config.js  then run 'npm run build:md-magic' in the docs folder. -->

## Getting Started

You can run this example using the following steps:

1. Run `npm install` and `npm run build:fast -- --nolint` from the `FluidFramework` root directory.
    - For an even faster build, you can add the package name to the build command, like this:
      `npm run build:fast -- --nolint @fluid-example/table-view`
1. Run `npm run start` from this directory (examples/data-objects/table-view) and open <http://localhost:8080> in a web browser to see the app running.

<!-- AUTO-GENERATED-CONTENT:END -->

## Data model

Table View uses the following distributed data structures:

- SharedDirectory - root

Table View creates the following Fluid objects:

- `@fluid-example/table-document`
