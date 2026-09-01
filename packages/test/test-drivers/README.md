# @fluid-private/test-drivers

This package provides a simple and common driver abstraction that can be used by tests to be server agnostic.


<!-- AUTO-GENERATED-CONTENT:START (LIBRARY_README_HEADER) -->

<!-- prettier-ignore-start -->
<!-- NOTE: This section is automatically generated using @fluid-tools/markdown-magic. Do not update these generated contents directly. -->

**NOTE: This package is private to the `@microsoft/fluid-framework` repository.**
**This package is not published.**
**Use it only in packages in the same pnpm workspace.**
**Specify [`workspace:*`](https://pnpm.io/workspaces#workspace-protocol-workspace) as the version.**
**Use this package only as a development dependency or as a dependency of an unpublished package.**

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
These are important to get right for the specific environment you're targeting, otherwise the test driver might
configure things in a way that the target environment doesn't expect, and you could see weird and unexpected
errors when running tests.

Usually you'll pass these as extra flags when running tests. E.g., to run our e2e tests against a routerlicious instance
running locally in docker per our dev setup for it in `@fluid-private/test-end-to-end-tests` you'll want to run:

```bash
<base command to kick-off tests> --driver=r11s --r11sEndpointName=docker
```

E.g.

```bash
npm run test:realsvc:run -- --driver=r11s --r11sEndpointName=docker
```

### Custom server endpoints

Set `fluid__test__driver__<r11sEndpointName>` to a JSON configuration when running against a
deployment with custom server endpoints. Existing configurations can continue to use `host`, which derives
the Alfred, Historian, and Nexus URLs by replacing `www` in the host name.

For deployments with unique service URLs, specify all three service URLs:

```bash
export fluid__test__driver__custom='{
	"host": "https://app.example.com",
	"tenantId": "fluid",
	"tenantSecret": "<tenant-secret>",
	"ordererUrl": "https://alfred.example.com",
	"deltaStorageUrl": "https://historian.example.com",
	"deltaStreamUrl": "https://nexus.example.com"
}'

npm run test:realsvc:run -- --driver=r11s --r11sEndpointName=custom
```

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
