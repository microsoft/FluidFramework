# @fluid-example/inventory-app

Minimal sample demonstrating use of the SharedTree API.

<!-- markdown-magic:begin {"transform":"example-app-readme-header","serviceClient":true,"headingLevel":2} -->
<!-- prettier-ignore-start -->
<!-- NOTE: This section is automatically generated using @fluid-tools/markdown-magic. Do not update these generated contents directly. -->

## Getting Started

Complete these steps to run the example:

1. Enable [corepack](https://nodejs.org/docs/latest-v16.x/api/corepack.html) by running `corepack enable`.
1. Run `pnpm install` and `pnpm run build:fast --nolint` from the `FluidFramework` root directory.
    - For an even faster build, you can add the package name to the build command, like this:
      `pnpm run build:fast --nolint @fluid-example/inventory-app`
1. Run `pnpm start` from this directory and open <http://localhost:8080> in a web browser. The app uses an ephemeral in-browser service by default and stores the container ID in the URL hash.
1. To retain data across reloads in the current browser tab, run `pnpm start:session` and open <http://localhost:8080/?fluidClient=session>.
1. To share data between browser sessions, start Tinylicious in a separate terminal by running `pnpm tinylicious` in this directory, then run `pnpm start:tinylicious` and open <http://localhost:8080/?fluidClient=tinylicious>. In GitHub Codespaces, set the forwarded Tinylicious port 7070 visibility to **Public** before opening the app.

<!-- prettier-ignore-end -->
<!-- markdown-magic:end -->

## Testing

```bash
npm run test
```

## Trademark

This project may contain Microsoft trademarks or logos for Microsoft projects, products, or services. Use of these trademarks
or logos must follow Microsoft's [Trademark & Brand Guidelines](https://www.microsoft.com/en-us/legal/intellectualproperty/trademarks/usage/general).
Use of Microsoft trademarks or logos in modified versions of this project must not cause confusion or imply Microsoft sponsorship.

<!-- markdown-magic:begin {"transform":"readme-footer","headingLevel":2} -->
<!-- prettier-ignore-start -->
<!-- NOTE: This section is automatically generated using @fluid-tools/markdown-magic. Do not update these generated contents directly. -->

## Contribution Guidelines

You can [contribute](https://github.com/microsoft/FluidFramework/blob/main/CONTRIBUTING.md) to Fluid Framework in these ways:

- Answer questions in [GitHub Discussions](https://github.com/microsoft/FluidFramework/discussions).
- [Submit bug reports](https://github.com/microsoft/FluidFramework/issues) and help verify fixes.
- Review [source code changes](https://github.com/microsoft/FluidFramework/pulls).
- [Contribute bug fixes](https://github.com/microsoft/FluidFramework/blob/main/CONTRIBUTING.md).

For detailed instructions, read the [repo documentation](https://github.com/microsoft/FluidFramework/blob/main/docs/content/Home.md).

This project follows the [Microsoft Open Source Code of Conduct](https://opensource.microsoft.com/codeofconduct/).
For more information, read the [Code of Conduct frequently asked questions](https://opensource.microsoft.com/codeofconduct/faq/).
For questions or comments, contact <opencode@microsoft.com>.

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
<!-- markdown-magic:end -->
