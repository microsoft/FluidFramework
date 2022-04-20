# @fluid-experimental/property-inspector
An app for inspecting documents created by PropertyDDS using an efficient table-tree.


<!-- AUTO-GENERATED-CONTENT:START (GET_STARTED:tinylicious=true) -->
<!-- The getting started instructions are automatically generated.
To update them, edit docs/md-magic.config.js, then run 'npm run build:md-magic' -->

## Getting Started

You can run this example using the following steps:

1. Run `npm install` and `npm run build:fast -- --nolint` from the `FluidFramework` root directory.
   a. For an even faster build, you can add the package name to the build command, like this:
      `npm run build:fast -- --nolint @fluid-example/collaborative-textarea`
1. In a separate terminal, start a Tinylicious server by following the instructions in [Tinylicious](../../../../server/tinylicious).
1. Run `npm run start` from this directory (examples/apps/collaborative-textarea) and open <http://localhost:8080> in a web browser to see the app running.
<!-- AUTO-GENERATED-CONTENT:END -->

## Other Setup

After cloning the repository, install dependencies with:

Go back to the root folder and run:
```bash
npm install
alias fb='clear && node "$(git rev-parse --show-toplevel)/node_modules/.bin/fluid-build"'
fb --install --symlink:full
fb --all @fluid-experimental/property-inspector tinylicious
```

You can then run the example with:

```bash
npm start
```

This will open a browser window to the example.  You can navigate to the same URL in a second window to see changes propagating between clients.

To webpack the bundle and output the result in `./dist`, you can run:

```bash
npm run build
```
