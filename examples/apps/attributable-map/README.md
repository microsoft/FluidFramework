# @fluid-example/attributable-map

Note:

1. This is an experimental demo for the experimental DDS [AttributableMap](../../../experimental/dds/attributable-map/README.md)
2. The current behavior displays a potential bug where there is a slight delay in showing the attribution. It is probable that this bug is caused by a lack of synchronization between the `setCore` and `setAttribution` functions. We are addressing the bug right now.

**Hit Counter** is a simple demonstration that showcases how to use the `mixinAttributor` and the experimental DDS `AttributableMap`.
The user can click on the button to increment the count value by one. Upon updating the count value, the corresponding attribution key will also be updated.
The attributor then retrieves the attribution information and stores it, allowing all co-authors to automatically view the latest timestamp at which any author pressed the hit button.
The attribution information, which consists of the user name and the timestamp of the most recent edit, is displayed at the bottom. Please refer to [Attributor](../../../packages/framework/attributor/README.md) and [AttributableMap](../../../experimental/dds/attributable-map/README.md) for more details

When the app loads it will update the URL. Copy that new URL into a second browser and note that if you click the button in one browser, the counter value and attribution information in other browsers are synchronized as well.

![timestamp-watcher](./images/hitcounter.gif)

<!-- AUTO-GENERATED-CONTENT:START (README_EXAMPLE_GETTING_STARTED_SECTION:usesTinylicious=TRUE) -->

<!-- prettier-ignore-start -->
<!-- NOTE: This section is automatically generated using @fluid-tools/markdown-magic. Do not update these generated contents directly. -->

## Getting Started

You can run this example using the following steps:

1. Enable [corepack](https://nodejs.org/docs/latest-v16.x/api/corepack.html) by running `corepack enable`.
1. Run `pnpm install` and `pnpm run build:fast --nolint` from the `FluidFramework` root directory.
    - For an even faster build, you can add the package name to the build command, like this:
      `pnpm run build:fast --nolint @fluid-example/attributable-map`
1. In a separate terminal, start a Tinylicious server by following the instructions in [Tinylicious](https://github.com/microsoft/FluidFramework/tree/main/server/tinylicious).
1. Run `pnpm start` from this directory and open <http://localhost:8080> in a web browser to see the app running.

<!-- prettier-ignore-end -->

<!-- AUTO-GENERATED-CONTENT:END -->

## Data model

The project uses the following distributed data structures:

-   SharedDirectory - root
-   AttributableMap - HitCounter
