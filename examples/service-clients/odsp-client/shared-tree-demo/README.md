# @fluid-example/shared-tree-demo

**_This demo is a work-in-progress_**

This app demonstrates how to create a simple tree data structure and build a React app using that data. This app is designed to use Odsp Client backed by ODSP service.

## Gettting started

All the code required to set up the Fluid Framework and SharedTree data structure is in the `fluid.ts` source file. Most of this code will be the same for any app. However, because SharedTree is still in the alpha stage, the code to set it up isn't optimized yet.

You can run this example using the following steps:

1. To kick off the example, update the credentials in the `clientProps.ts` file by replacing siteUrl, driveId, and clientId with your own.
1. Run `pnpm install` and `pnpm run build:fast --nolint` from the `FluidFramework` root directory.
    - For an even faster build, you can add the package name to the build command, like this:
      `pnpm run build:fast --nolint @fluid-example/shared-tree-demo`
1. Run `pnpm start` from this directory and open <http://localhost:8080> in a web browser to see the app running.
1. Login with your M365 tenant email and password to see the example in action on your web browser.
