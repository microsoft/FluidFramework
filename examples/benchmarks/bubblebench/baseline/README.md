# @fluid-example/bubblebench-baseline

<!-- markdown-magic:begin {"transform":"example-app-readme-header","usesTinylicious":false,"headingLevel":2} -->

<!-- prettier-ignore-start -->

<!-- NOTE: This section is automatically generated using @fluid-tools/markdown-magic. Do not update these generated contents directly. -->

## Getting Started

Complete these steps to run the example:

1. Run `corepack enable` to enable [Corepack](https://nodejs.org/docs/latest-v16.x/api/corepack.html).
2. From the `FluidFramework` root directory, run `pnpm install`.
3. From the `FluidFramework` root directory, run `pnpm run build:fast --nolint`.
   * To build only this package, add the package name to the command:
     `pnpm run build:fast --nolint @fluid-example/bubblebench-baseline`
4. Run `pnpm start` from this directory.
5. Open <http://localhost:8080> in a web browser.

To run the example with SharePoint, complete these steps:

1. Follow the [webpack-fluid-loader instructions](https://github.com/microsoft/FluidFramework/blob/main/examples/utils/webpack-fluid-loader/README.md#sharepoint) to get authentication credentials.
2. Run `pnpm start:spo` or `pnpm start:spo-df` from this directory.
3. Open <http://localhost:8080> in a web browser.

<!-- prettier-ignore-end -->

<!-- markdown-magic:end -->

## Testing

```bash
npm run test:playwright
```

To run the tests in a visible browser with the Playwright inspector:

```bash
npm run test:playwright -- --headed --debug
```
