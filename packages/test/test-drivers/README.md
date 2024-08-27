# @fluid-private/test-drivers

This package provides a simple and common driver abstraction that can be used by tests to be server agnostic.


<!-- AUTO-GENERATED-CONTENT:START (LIBRARY_README_HEADER) -->

<!-- prettier-ignore-start -->
<!-- NOTE: This section is automatically generated using @fluid-tools/markdown-magic. Do not update these generated contents directly. -->

**NOTE: This package is private to the `@microsoft/fluid-framework` repository.**
**It is not published, and therefore may only be used in packages within the same pnpm workspace in this repo using the [workspace:*](https://pnpm.io/workspaces#workspace-protocol-workspace) schema.**
**Since this package is not published, it may also only be used as a dev dependency, or as a dependency in packages that are not published.**

<!-- prettier-ignore-end -->

<!-- AUTO-GENERATED-CONTENT:END -->

## Usage

`createCreateNewRequest` and `createContainerUrl` both take a test id.
The test id may not map directly to any specific Fluid Framework concept.
Repeated calls will the same test id should return the same result.

If you need more control you should disambiguate the driver based on its
type, this should only be done it absolutely necessary for complex scenarios
as the test may not work against all supported servers if done.

If mocha tests wish to not run or only run on specific servers in a mocha test they should do something like the following:

```typescript
before(function () {
	const driver = getFluidTestDriver();
	if (driver.type !== "local") {
		this.skip();
	}
});
```

The `function` syntax must be used for `this.skip()` to be available, arrow function will not work.

### Driver endpoint names

Some drivers take a second bit of configuration besides the driver type, which is a specific "target environment",
usually referred to as `<driverType>EndpointName`, e.g. `odspEndpointName` and `r11sEndpointName`.
These are important to get right for the specific environment you're targetting, otherwise the test driver might
configure things in a way that the target environment doesn't expect, and you could see weird and unexpected
errors when running tests.

Usually you'll pass these as extra flags when running tests. E.g., to run our e2e tests against a routerlicious instance
running locally in docker per our dev setup for it, you'll want to run:

```bash
<base command to kick-off tests> --driver=r11s --r11sEndpointName=docker
```

E.g.

```bash
npm run test:realsvc:run -- --driver=r11s --r11sEndpointName=docker
```

<!-- AUTO-GENERATED-CONTENT:START (README_FOOTER) -->

<!-- prettier-ignore-start -->
<!-- NOTE: This section is automatically generated using @fluid-tools/markdown-magic. Do not update these generated contents directly. -->

## Contribution Guidelines

There are many ways to [contribute](https://github.com/microsoft/FluidFramework/blob/main/CONTRIBUTING.md) to Fluid.

-   Participate in Q&A in our [GitHub Discussions](https://github.com/microsoft/FluidFramework/discussions).
-   [Submit bugs](https://github.com/microsoft/FluidFramework/issues) and help us verify fixes as they are checked in.
-   Review the [source code changes](https://github.com/microsoft/FluidFramework/pulls).
-   [Contribute bug fixes](https://github.com/microsoft/FluidFramework/blob/main/CONTRIBUTING.md).

Detailed instructions for working in the repo can be found in the [Wiki](https://github.com/microsoft/FluidFramework/wiki).

This project has adopted the [Microsoft Open Source Code of Conduct](https://opensource.microsoft.com/codeofconduct/).
For more information see the [Code of Conduct FAQ](https://opensource.microsoft.com/codeofconduct/faq/) or contact [opencode@microsoft.com](mailto:opencode@microsoft.com) with any additional questions or comments.

This project may contain Microsoft trademarks or logos for Microsoft projects, products, or services.
Use of these trademarks or logos must follow Microsoft’s [Trademark & Brand Guidelines](https://www.microsoft.com/trademarks).
Use of Microsoft trademarks or logos in modified versions of this project must not cause confusion or imply Microsoft sponsorship.

## Help

Not finding what you're looking for in this README? Check out [fluidframework.com](https://fluidframework.com/docs/).

Still not finding what you're looking for? Please [file an issue](https://github.com/microsoft/FluidFramework/wiki/Submitting-Bugs-and-Feature-Requests).

Thank you!

## Trademark

This project may contain Microsoft trademarks or logos for Microsoft projects, products, or services.

Use of these trademarks or logos must follow Microsoft's [Trademark & Brand Guidelines](https://www.microsoft.com/en-us/legal/intellectualproperty/trademarks/usage/general).

Use of Microsoft trademarks or logos in modified versions of this project must not cause confusion or imply Microsoft sponsorship.

<!-- prettier-ignore-end -->

<!-- AUTO-GENERATED-CONTENT:END -->
