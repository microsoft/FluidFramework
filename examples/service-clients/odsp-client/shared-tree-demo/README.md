# @fluid-example/shared-tree-demo

**_This demo is a work-in-progress_**

This app demonstrates how to create a simple tree data structure and build a React app using that data. This app is designed to use Odsp Client backed by ODSP service.

## Gettting started

All the code required to set up the Fluid Framework and SharedTree data structure is in the `fluid.ts` source file. Most of this code will be the same for any app. However, because SharedTree is still in the alpha stage, the code to set it up isn't optimized yet.

You can run this example using the following steps:

1. To kick off the example, first copy the `.env.template` file to `.env`, filling in the values with your own.
	   See documentation in `.env.template` for details about each value.
1. Run `pnpm install` and `pnpm run build:fast --nolint` from the `FluidFramework` root directory.
    - For an even faster build, you can add the package name to the build command, like this:
      `pnpm run build:fast --nolint @fluid-example/shared-tree-demo`
1. Run `pnpm start` from this directory and open <http://localhost:8080> in a web browser to see the app running.
1. Login with your M365 tenant email and password to see the example in action on your web browser. If you encounter issues like `Need admin approval`, consider using a private or incognito window to execute the example. In particular, beware of Edge's work profiles which will sign in automatically with the linked Microsoft credentials, which might not have access to the M356 tenant.

<!-- AUTO-GENERATED-CONTENT:START (README_FOOTER) -->

<!-- prettier-ignore-start -->
<!-- NOTE: This section is automatically generated using @fluid-tools/markdown-magic. Do not update these generated contents directly. -->

## Contribution Guidelines

You can [contribute](https://github.com/microsoft/FluidFramework/blob/main/CONTRIBUTING.md) to Fluid Framework in these ways:

-   Answer questions in [GitHub Discussions](https://github.com/microsoft/FluidFramework/discussions).
-   [Submit bug reports](https://github.com/microsoft/FluidFramework/issues) and help verify fixes.
-   Review [source code changes](https://github.com/microsoft/FluidFramework/pulls).
-   [Contribute bug fixes](https://github.com/microsoft/FluidFramework/blob/main/CONTRIBUTING.md).

For detailed instructions, read the [repo documentation](https://github.com/microsoft/FluidFramework/blob/main/docs/content/Home.md).

This project follows the [Microsoft Open Source Code of Conduct](https://opensource.microsoft.com/codeofconduct/).
For more information, read the [Code of Conduct frequently asked questions](https://opensource.microsoft.com/codeofconduct/faq/).
For questions or comments, contact [opencode@microsoft.com](mailto:opencode@microsoft.com).

This project may contain Microsoft trademarks or logos for Microsoft projects, products, or services.
Use of these trademarks or logos must follow Microsoft’s [Trademark & Brand Guidelines](https://www.microsoft.com/trademarks).
Use of Microsoft trademarks or logos in modified versions of this project must not cause confusion or imply Microsoft sponsorship.

## Help

Read the [Fluid Framework documentation](https://fluidframework.com/docs/) for information about Fluid Framework concepts and APIs.

To request information that the documentation does not contain, [create an issue](https://github.com/microsoft/FluidFramework/blob/main/docs/content/Contributing/Submitting-Bugs-and-Feature-Requests.md).

## Trademark

This project may contain Microsoft trademarks or logos for Microsoft projects, products, or services.

Use of these trademarks or logos must follow Microsoft's [Trademark & Brand Guidelines](https://www.microsoft.com/en-us/legal/intellectualproperty/trademarks/usage/general).

Use of Microsoft trademarks or logos in modified versions of this project must not cause confusion or imply Microsoft sponsorship.

<!-- prettier-ignore-end -->

<!-- AUTO-GENERATED-CONTENT:END -->
