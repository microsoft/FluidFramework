# @fluid-private/test-end-to-end-tests

This package hosts end-to-end tests for the Fluid Framework.
The tests are end-to-end in the sense that they construct, load, and orchestrate collaborative scenarios involving containers
in much the same way a real application using Fluid would.

These tests are additionally meaningfully parameterized over two dimensions

-   the underlying services the clients are using (see `@fluid-internal/test-driver-definitions`, `@fluid-private/test-drivers`, and [its README](../test-drivers/README.md) for more information)
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

Less common APIs can be found on `apis.<layer-name>.packages.<package-name>` (package names are unscoped and camelCased).
Keep in mind that if these APIs change over time, tests depending on them will either need to have a reduced compat matrix or include back-compat logic.
See "Change contents of dds, then rehydrate and then check summary" for an example of such a test.

### ❌ Incorrect

```typescript
import { SharedString, createOverlappingIntervalsIndex } from "@fluidframework/sequence";

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

	it("supports collaborative text with intervals", async () => {
		const container1 = await provider.makeTestContainer(testContainerConfig);
		const dataObject1 = (await container1.getEntryPoint()) as ITestFluidObject;
		const sharedString1 = await dataObject1.getSharedObject<SharedString>(stringId);
		const overlapping = createOverlappingIntervalsIndex(sharedString1);
	});
});
```

#### ✅ Correct

```typescript
describeCompat("SharedString", "FullCompat", (getTestObjectProvider, api) => {
	const { SharedString } = api.dds;
	const { createOverlappingIntervalsIndex } = api.dataRuntime.packages.sequence;

	// Note that `SharedString` below is equivalent to `api.dds.SharedString`.
	// It can be used as if you had imported it from @fluidframework/sequence at runtime.
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
		const dataObject1 = (await container1.getEntryPoint()) as ITestFluidObject;
		const sharedString1 = await dataObject1.getSharedObject<SharedString>(stringId);
		const overlapping = createOverlappingIntervalsIndex(sharedString1);
	});
});
```

If your code needs to refer to a DDS's type (e.g. to explicitly annotate the type of a variable), you can
use `import type` expressions freely:

```typescript
import type { SharedString } from "@fluidframework/sequence";

function insert(str: SharedString): void {
	str.insertText(0, "hello");
}
```

#### Exceptions

Enforcement of this rule is a work in progress.

-   Some test-version-utils APIs such as `describeInstallVersions` don't make static import convenient.
-   Not all imports are yet enforced.

### Example

Take a look at the [SharedStringEndToEndTest](src/test/sharedStringEndToEndTests.spec.ts) for a basic example
of how to write an end-to-end test.

That same [directory](src/test) contains more complex examples too.

## Debugging

This package contains a VSCode workspace with launch targets for debugging e2e tests with common configurations.
The launch targets in this configuration allow selecting different drivers, compat modes, and setting breakpoints in dependent packages installed for compat testing.
See `.vscode/e2e-tests.code-workspace` for details.

If not using this workspace, in order to debug legacy code running as part of an end-to-end test, you'll need to modify the debug launch configuration to include `node_modules` in its set of loaded files.

For example, if using "Debug Current Mocha Test" or one of its variants, remove the `node_modules` entry under `"skipFiles"`.

Break points in the set of legacy modules (found in test-version-utils' install tree) will then properly be hit.

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
