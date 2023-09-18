# @fluid-internal/test-drivers

This package provides a simple and common driver abstraction that can be used by tests to be server agnostic.

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

## Driver endpoint names

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
