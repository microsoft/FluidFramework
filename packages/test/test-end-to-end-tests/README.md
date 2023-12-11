# @fluid-private/test-end-to-end-tests

This package hosts end-to-end tests for the Fluid framework.
The tests are end-to-end in the sense that they construct, load, and orchestrate collaborative scenarios involving containers
in much the same way a real application using Fluid would.

These tests are additionally meaningfully parameterized over two dimensions

-   the underlying services the clients are using (see `@fluid-private/test-driver-definitions`, `@fluid-private/test-drivers`, and [its README](../test-drivers/README.md) for more information)
-   a compatibility configuration determining which versions of packages should be used to create/load containers

Testing against a variety of drivers helps catch server-specific bugs.
It also enables running against more reliable analogs of real services that don't have availability issues, such as an "in-process service implementation" (LocalDriver) or "same-machine, out-of-process service" (tinylicious).

Testing using containers loaded with different versions of Fluid helps to enforce we maintain compatibility across layers and versions.
See [Compatibility.md](../../../docs/content/docs/deep/compatibility.md) for some relevant concerns.

## How-to

The tests in this package are typically built upon:

-   The test utilities in [test-utils](../test-utils/README.md), which simplify the public API for some common types of e2e tests and provide APIs necessary to write deterministic tests you wouldn't expect to have on the production driver API (e.g. `testObjectProvider.ensureSynchronized` to make sure collaborating containers process all ops before running assertions)
-   The compatibility utilities in [test-version-utils](../test-version-utils/README.md), which handle loading different-versioned packages and compatibility policy (see `describeCompat`).

Check out the test-utils [README](../test-utils/README.md) that outlines how to write a test.

Whenever possible, try to avoid importing Fluid APIs statically, since that won't fully leverage `test-version-utils`:
the containers the test constructs will only reference code in the current version of Fluid.
Instead, use the `apis` argument passed to `describeCompat`'s test creation function.
This argument provides Fluid public APIs which internally reference the package version being tested under the current compatibility configuration.
The APIs are organized roughly by layer, i.e. `apis.dds` exports the various DDS types,
`apis.containerRuntime` exports concepts for building a container runtime (including bits of `@fluidframework/aqueduct`), etc.

### ❌ Incorrect

```typescript
import { SharedString } from "@fluidframework/sequence";

const registry: ChannelFactoryRegistry = [["sharedString", SharedString.getFactory()]];
const testContainerConfig: ITestContainerConfig = {
	fluidDataObjectType: DataObjectFactoryType.Test,
	registry,
};

describeCompat("SharedString", "FullCompat", (getTestObjectProvider) => {
	let provider: ITestObjectProvider;
	beforeEach(() => {
		provider = getTestObjectProvider();
	});

	it("supports collaborative text", async () => {
		const container1 = await provider.makeTestContainer(testContainerConfig);
	});
});
```

#### ✅ Correct

```typescript
// If you don't need to refer to the SharedString type, you can omit the emport entirely!
import type { SharedString } from "@fluidframework/sequence";

describeCompat("SharedString", "FullCompat", (getTestObjectProvider, apis) => {
	const { SharedString } = apis.dds;
	const registry: ChannelFactoryRegistry = [["sharedString", SharedString.getFactory()]];
	const testContainerConfig: ITestContainerConfig = {
		fluidDataObjectType: DataObjectFactoryType.Test,
		registry,
	};

	let provider: ITestObjectProvider;
	beforeEach(() => {
		provider = getTestObjectProvider();
	});

	it("supports collaborative text", async () => {
		const container1 = await provider.makeTestContainer(testContainerConfig);
	});
});
```

### Example

Take a look at the [SharedStringEndToEndTest](src/test/sharedStringEndToEndTests.spec.ts) for a basic example
of how to write an end-to-end test.

That same [directory](src/test) contains more complex examples too.

## "Real Service" Tests

The tests under the `real-service-tests` dir target a live production service like r11s or ODSP's Fluid server.
These are run via `npm run test:realsvc:mocha`, and are included in the CI such that a test failure doesn't
fail the pipeline - since a service outage or network hiccup could cause a failure when no code defect is present.

### Enpdoint names

When running tests against ODSP or R11s, be mindful of a second parameter/flag usually referred to as the "endpoint name".
This should match the target environment you want to run against or the test driver might configure things in a way
that the target environment doesn't expect, and you could see weird and unexpected errors when running tests.

For ODSP, the possible endpoint names are `odsp` (for a tenant in the production ODSP environment) and `odsp-df`
(for the dogfood environment).
The default is `odsp`.
For Routerlicious, they are `r11s` (for the internal cluster in Azure) and `docker` (when running routerlicious locally
in docker with our development setup).
The default is `r11s`.

For example:

```bash
npm run test:realsvc:run -- --driver=odsp
npm run test:realsvc:run -- --driver=odsp --odspEndpointName=odsp-df
npm run test:realsvc:run -- --driver=r11s
npm run test:realsvc:run -- --driver=r11s --r11sEndpointName=docker
```

## Trademark

This project may contain Microsoft trademarks or logos for Microsoft projects, products, or services. Use of these trademarks
or logos must follow Microsoft's [Trademark & Brand Guidelines](https://www.microsoft.com/en-us/legal/intellectualproperty/trademarks/usage/general).
Use of Microsoft trademarks or logos in modified versions of this project must not cause confusion or imply Microsoft sponsorship.
