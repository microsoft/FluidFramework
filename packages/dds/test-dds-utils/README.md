# @fluid-private/test-dds-utils

Utilities for writing unit tests for DDS in Fluid Framework.

<!-- markdown-magic:begin {"transform":"library-readme-header","headingLevel":2} -->
<!-- prettier-ignore-start -->
<!-- NOTE: This section is automatically generated using @fluid-tools/markdown-magic. Do not update these generated contents directly. -->

**NOTE: This package is private to the `@microsoft/fluid-framework` repository.**
**This package is not published.**
**Use it only in packages in the same pnpm workspace.**
**Specify [`workspace:*`](https://pnpm.io/workspaces#workspace-protocol-workspace) as the version.**
**Use this package only as a development dependency or as a dependency of an unpublished package.**

<!-- prettier-ignore-end -->
<!-- markdown-magic:end -->

## Garbage Collection (GC) unit tests

[gcTestRunner](./src/gcTestRunner.ts) provides a set of tests for validating that the DDSes return correct GC nodes.

To write GC tests for a DDS, call `runGCTests` with a class that implements the following interface:

```typescript
export interface IGCTestProvider {
	/** The DDS whose GC data is to be verified */
	readonly sharedObject: ISharedObject;
	/** The expected list of outbound routes from this DDS */
	readonly expectedOutboundRoutes: string[];
	/** Function that adds routes to Fluid objects to the DDS' data */
	addOutboundRoutes(): Promise<void>;
	/** Function that deletes routes to Fluid objects to the DDS' data */
	deleteOutboundRoutes(): Promise<void>;
	/** Function that adds nested handles to the DDS' data */
	addNestedHandles(): Promise<void>;
}
```

The caller is responsible for the following:

1. Adding and deleting routes to Fluid objects to the DDS which is being tested.
2. Adding nested handles to the DDS' data.
3. Maintaining the list of expected outbound routes. The tests query this and validates that the GC data returned by the DDS matches these routes.

### Examples

[SharedCell](../cell/src/test/cell.spec.ts) and [SharedDirectory](../map/test/directory.spec.ts) have tests that use the gcTestRunner for validating GC data.

## Eventual Consistency Fuzz Tests

This package also provides a [generic harness](./src/ddsFuzzHarness.ts) for writing eventual consistency fuzz tests for a DDS.
This model is written using [@fluid-private/stochastic-test-utils](../../test/stochastic-test-utils/README.md).
See documentation on `createDDSFuzzSuite` and `DDSFuzzModel` for more details.

The harness currently supports testing eventual consistency of op application using Fluid's set of [mocks](../../runtime/test-runtime-utils/README.md)
including the reconnect flow.

### Per-client configuration

Set `DDSFuzzModel.clientConfiguration` to construct clients with different DDS options or package versions.
You define the configuration values and supply a callback that resolves each value to an `IChannelFactory`.
The factories must expose a common channel API that your model can use.

Use `generate(random, client)` to select a configuration with seeded randomness.
The client context includes `clientId` and `isSummarizer`, so you can give the summarizer a specific configuration.
Use `factory(clientConfiguration)` to resolve the recorded value without making new random choices.
The configuration must round-trip through JSON without changes.
Objects, arrays, strings, numbers, booleans, and `null` are supported; handles, functions, `undefined`, and non-finite numbers are not.
Do not mutate configurations after they are generated.

For example, a model with an existing workload can select between two compatible factories:

```typescript
type ClientConfiguration = { version: "current" | "previous" };
type Factory = typeof currentFactory | typeof previousFactory;
type State = DDSFuzzTestState<Factory, ClientConfiguration>;

const model: DDSFuzzModel<Factory, Operation, State> = {
	...existingModel,
	clientConfiguration: {
		generate: (random, { isSummarizer }) => ({
			version: isSummarizer ? "current" : random.pick(["current", "previous"]),
		}),
		factory: ({ version }) =>
			version === "current" ? currentFactory : previousFactory,
	},
};
```

Your resolver can also construct a factory from options stored in the configuration.
When client configuration is enabled, this resolver replaces `model.factory` for all client construction.
The existing `factory` property is still required, but is not used in configured runs.

The harness records the initial clients in an `initialize` operation.
It records subsequent choices in `attach.clients` and `addClient.clientConfiguration`.
Each created client exposes its value as `client.clientConfiguration`, including in `clientCreate` listeners.
The `testStart` event occurs after initialization and before the workload generator is created.
Rehydration and stash restoration retain the original client's configuration, even if the client gets a new name.

Replay and minimization use the recorded choices without calling `generate`.
Configured replays must include their initialization and client configurations; old logs without these values must be replayed with the original, unconfigured model.
If you omit `clientConfiguration`, the harness keeps its existing initialization, operation format, and random-number consumption.
The same configuration mechanism is available in `SquashFuzzModel`.

### Future Improvements

The generic aspects of this model could be improved to fuzz test correctness a few other general concerns DDS authors have:

-   Summarization correctness
-   Offline (`applyStashedOp` implementation)

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
