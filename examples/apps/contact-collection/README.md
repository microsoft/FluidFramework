# @fluid-example/contact-collection

**Contact collection** demonstrates how a data object can be treated as a collection of multiple smaller objects.

The collection pattern demonstrated here might be a fit for your scenario if:

1. Your data can be described as a homogenous collection of separately usable pieces.
1. The consumers of your data (e.g. views or other data objects) might prefer to operate on a single piece, rather than the full collection.

Whereas a non-collection approach might have a collection data object holding handles to many other completely distinct data objects, the collection approach uses a single data object to organize all the data in one place. It then provides interfaces to access individual members as standalone objects. In this example, the `ContactCollection` data object stores contact data with one contact per key in its root, to be accessed through a `Contact` class which is not a data object. In comparison, the non-collection approach would have stored handles to separate `Contact` (full-fledged) data objects. `@fluid-example/todo` is a good example of the non-collection approach, storing `TodoItem` data objects as handles in the `Todo` data object.

The key feature of the collection pattern is that it facilitates individual retrieval of a piece for use in consumers that don't wish to operate on (or shouldn't have access to) the full collection. This enables you to retain the granular access that individual data objects provide without the overhead of data object creation and async access of handles.

The specific access mechanisms can vary -- in this example, `ContactCollection` has `getContacts()` and `getContact()` methods which return `Contact` objects. `getContacts()` is used in the `renderContactCollection()` view, and `getContact()` is used by the app to retrieve a singular `Contact` for use with the `renderContact()` view.

For another example of this pattern, consider the `SharedDirectory` DDS. The `getWorkingDirectory()` method allows granular access to an `IDirectory` that can be used separately from the remainder of the `SharedDirectory`, despite the data being stored in the same data store. Although the details differ since it is a DDS rather than a data object, the principle is the same.

<!-- AUTO-GENERATED-CONTENT:START (EXAMPLE_APP_README_HEADER:usesTinylicious=TRUE) -->

<!-- prettier-ignore-start -->
<!-- NOTE: This section is automatically generated using @fluid-tools/markdown-magic. Do not update these generated contents directly. -->

## Getting Started

Complete these steps to run the example:

1. Run `corepack enable` to enable [Corepack](https://nodejs.org/docs/latest-v16.x/api/corepack.html).
1. From the `FluidFramework` root directory, run `pnpm install`.
1. From the `FluidFramework` root directory, run `pnpm run build:fast --nolint`.
    - To build only this package, add the package name to the command:
      `pnpm run build:fast --nolint @fluid-example/contact-collection`
1. In a separate terminal, run `pnpm tinylicious` from this directory to start Tinylicious.
1. If you use GitHub Codespaces in a browser, set the visibility of the Tinylicious port (7070) to `public`. Do not use `Private to Organization`. For instructions, read [Sharing a port](https://docs.github.com/en/codespaces/developing-in-a-codespace/forwarding-ports-in-your-codespace#sharing-a-port).
1. Run `pnpm start` from this directory.
1. Open <http://localhost:8080> in a web browser.

To run the example with SharePoint, complete these steps:

1. Follow the [webpack-fluid-loader instructions](https://github.com/microsoft/FluidFramework/blob/main/examples/utils/webpack-fluid-loader/README.md#sharepoint) to get authentication credentials.
1. Run `pnpm start:spo` or `pnpm start:spo-df` from this directory.
1. Open <http://localhost:8080> in a web browser.

<!-- prettier-ignore-end -->

<!-- AUTO-GENERATED-CONTENT:END -->

## Testing

```bash
npm run test:playwright
```

To run the tests in a visible browser with the Playwright inspector:

```bash
npm run test:playwright -- --headed --debug
```

## Data model

Contact collection uses the following distributed data structures:

-   SharedDirectory -- root

<!-- AUTO-GENERATED-CONTENT:START (README_FOOTER) -->

<!-- prettier-ignore-start -->
<!-- NOTE: This section is automatically generated using @fluid-tools/markdown-magic. Do not update these generated contents directly. -->

## Contribution Guidelines

You can [contribute](https://github.com/microsoft/FluidFramework/blob/main/CONTRIBUTING.md) to Fluid Framework in these ways:

-   Answer questions in [GitHub Discussions](https://github.com/microsoft/FluidFramework/discussions).
-   [Submit bug reports](https://github.com/microsoft/FluidFramework/issues) and help verify fixes.
-   Review [source code changes](https://github.com/microsoft/FluidFramework/pulls).
-   [Contribute bug fixes](https://github.com/microsoft/FluidFramework/blob/main/CONTRIBUTING.md).

For detailed instructions, read the [Fluid Framework wiki](https://github.com/microsoft/FluidFramework/blob/main/docs/content/Home.md).

This project follows the [Microsoft Open Source Code of Conduct](https://opensource.microsoft.com/codeofconduct/).
For more information, read the [Code of Conduct frequently asked questions](https://opensource.microsoft.com/codeofconduct/faq/).
For questions or comments, contact [opencode@microsoft.com](mailto:opencode@microsoft.com).

This project may contain Microsoft trademarks or logos for Microsoft projects, products, or services.
When you use these trademarks or logos, follow Microsoft's [Trademark and Brand Guidelines](https://www.microsoft.com/trademarks).
Do not use Microsoft trademarks or logos in a modified version of this project if the use causes confusion or implies Microsoft sponsorship.

## Help

Read the [Fluid Framework documentation](https://fluidframework.com/docs/) for information about Fluid Framework concepts and APIs.

To request information that the documentation does not contain, [create an issue](https://github.com/microsoft/FluidFramework/blob/main/docs/content/Contributing/Submitting-Bugs-and-Feature-Requests.md).

## Trademark

This project may contain Microsoft trademarks or logos for Microsoft projects, products, or services.

Use of these trademarks or logos must follow Microsoft's [Trademark & Brand Guidelines](https://www.microsoft.com/en-us/legal/intellectualproperty/trademarks/usage/general).

Use of Microsoft trademarks or logos in modified versions of this project must not cause confusion or imply Microsoft sponsorship.

<!-- prettier-ignore-end -->

<!-- AUTO-GENERATED-CONTENT:END -->
