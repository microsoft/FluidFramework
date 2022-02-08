# @fluid-example/likes

**Likes** is a Fluid object that displays how to use a combination of Fluid DDS hooks and local React hooks together.
It uses a SharedString and SharedCounter as part of its synced state. This shows how a React view can access multiple DDSes without any handlers or event listeners by accessing the respective synced hooks: useSyncedString and useSyncedCounter.

<!-- AUTO-GENERATED-CONTENT:START (GET_STARTED:tinylicious=true) -->
<!-- The getting started instructions are automatically generated.
To update them, edit docs/md-magic.config.js, then run 'npm run build:md-magic' -->

## Getting Started

You can run this example using the following steps:

1. Run `npm install` and `npm run build:fast -- --nolint` from the `FluidFramework` root directory.
   a. For an even faster build, you can add the package name to the build command, like this:
      `npm run build:fast -- --nolint @fluid-example/likes`
1. In a separate terminal, start a Tinylicious server by following the instructions in [Tinylicious](../../../server/tinylicious).
1. Run `npm run start` from this directory (examples/apps/likes) and open <http://localhost:8080> in a web browser to see the app running.
<!-- AUTO-GENERATED-CONTENT:END -->

## Files

#### app.tsx
This is the main file that starts running the likes app. It fetches the container for the Fluid object the app is using and proceeds to render the object on the browser at localhost:8080, and uses the locally running Tinylicious server instance.

#### container.ts
This is where the likes Fluid object registry entry is added to the container and a data store for it is generated.

#### fluidObject.tsx
This contains the actual definition for the Fluid object that the app is using. It extends the `SyncedDataObject` class and defines the DDSes that will be needed in the configuration set in the constructor. The view will consume this data to view the Fluid object.

#### view.tsx
The functional React view responsible for rendering the data provided by the Fluid object. It fetches the configured DDSes using the provided synced hooks.

#### utils.ts
Helper functions for the app.
