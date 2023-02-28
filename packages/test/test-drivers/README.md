# @fluidframework/test-drivers

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
