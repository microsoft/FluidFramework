# @fluid-experimental/attributor

This package contains definitions and implementations for framework-provided attribution functionality.

<!-- AUTO-GENERATED-CONTENT:START (LIBRARY_README_HEADER) -->

<!-- prettier-ignore-start -->
<!-- NOTE: This section is automatically generated using @fluid-tools/markdown-magic. Do not update these generated contents directly. -->

**IMPORTANT: This package is experimental.**
**Its APIs may change without notice.**

**Do not use in production scenarios.**

## Using Fluid Framework libraries

When taking a dependency on a Fluid Framework library's public APIs, we recommend using a `^` (caret) version range, such as `^1.3.4`.
While Fluid Framework libraries may use different ranges with interdependencies between other Fluid Framework libraries,
library consumers should always prefer `^`.

If using any of Fluid Framework's unstable APIs (for example, its `beta` APIs), we recommend using a more constrained version range, such as `~`.

## Installation

To get started, install the package by running the following command:

```bash
npm i @fluid-experimental/attributor
```

## API Documentation

API documentation for **@fluid-experimental/attributor** is available at <https://fluidframework.com/docs/apis/attributor>.

<!-- prettier-ignore-end -->

<!-- AUTO-GENERATED-CONTENT:END -->

## Status

All attribution APIs (both in this package and elsewhere in `@fluidframework` packages) are marked as [alpha](https://api-extractor.com/pages/tsdoc/tag_alpha/) to enable fast iteration (as third-party use is not officially supported, breaking API changes can be made in minor versions).

Despite this, the APIs are generally ready for early adoption--feel free to play around with them in local setups and provide feedback on their shape, usability, or other factors!

## Quickstart

To turn on op-stream based attribution in your container, use `mixinAttributor` to create a `ContainerRuntime` class which supports querying for attribution information.
When you instantiate your container runtime, pass a scope which implements `IProvideRuntimeAttributor`.

```typescript
import { ContainerRuntime } from "@fluidframework/container-runtime";
import { mixinAttributor, createRuntimeAttributor } from "@fluid-experimental/attributor";

const ContainerRuntimeWithAttribution = mixinAttributor(ContainerRuntime);

// ...then, in your ContainerRuntime factory use this class:
class ContainerRuntimeFactory implements IRuntimeFactory {
	public async instantiateRuntime(
		context: IContainerContext,
		existing?: boolean,
	): Promise<IRuntime> {
		const attributor = createRuntimeAttributor();
		// ...make this attributor accessible to your application however you deem fit; e.g. by registering it on a DependencyContainer.
		// To inject loading and storing of attribution data on your runtime, provide a scope implementing IProvideRuntimeAttributor:
		const scope: FluidObject<IProvideRuntimeAttributor> = { IRuntimeAttributor: attributor };
		const runtime = await ContainerRuntimeWithAttribution.load(
			context,
			dataStoreRegistry,
			undefined,
			undefined,
			scope,
		);
		// do whatever setup is necessary with the runtime here
		return runtime;
	}
}
```

This will cause your container runtime to load attribution data available on existing containers.
To additionally start storing attribution data on new documents, enable the config flag `"Fluid.Attribution.EnableOnNewFile"`.
Be sure to also [enable any necessary options at the DDS level](#dds-support).
For a more comprehensive list of backwards-compatability concerns which shed more light on these flags, see [integration](#integration).

Applications can recover this information using APIs on the DDSes they use. For example, the following code snippet illustrates how that works for `SharedString`:

```typescript
function getAttributionInfo(
	attributor: IRuntimeAttributor,
	sharedString: SharedString,
	pos: number,
): AttributionInfo | undefined {
	const { segment, offset } = sharedString.getContainingSegment(pos);
	if (!segment || !offset) {
		throw new UsageError("Invalid pos");
	}
	const attributionKey: AttributionKey = segment.attribution.getAtOffset(offset);
	// BEWARE: DDSes may track attribution key with type "detached" and "local", which aren't yet
	// supported out-of-the-box in IRuntimeAttributor. The application can recover AttributionInfo
	// from these keys if it wants using user information about the creator of the document and the
	// current active user, respectively.
	if (attributor.has(attributionKey)) {
		return attributor.get(attributionKey);
	}
}

// Get the user who inserted the text at position 0 in `sharedString` and the timestamp for when they did so.
const { user, timestamp } = getAttributionInfo(attributor, sharedString, 0);
```

## Overview

Attribution is inherently a content-based operation--it answers questions about who created or changed a piece of content as well as when they did it.
Since applications typically want attribution at a relatively fine-grained level, DDSes are the initial entrypoint for attributing content.
A DDS may define its attribution API as it sees fit, but should somehow expose a way to retrieve attribution keys from its content.
These attribution keys can be exchanged for user and timestamp information using the container runtime.

### DDS Support

The following DDSes currently support attribution:

-   [SharedString](../../dds/sequence/README.md#attribution)

### Op Stream Attribution

Framework-provided attribution tracks user and timestamp information for each op submitted.
Any more complex scenarios where attribution doesn't align with the direct submitter (such as attributing copy-pasted content to the original creators) will need to be handled by Fluid consumers using extensibility points.
The extensibility APIs are a work in progress; check back later for more details.

### Integration

Backwards-compatability for using this mixin with existing documents is a work in progress.
When an existing document is loaded that was created using a ContainerRuntimeFactory without a mixed in attributor,
that document will continue to operate as if no attribution has been mixed in.
Additionally, if a document that contains attribution is loaded using a container runtime without a mixed-in attributor,
any attribution information stored in that document may be lost.

The current design of the mixin's behavior is therefore motivated by the ability to roll out the feature in Fluid's collaborative environment.
The behavior of `"Fluid.Attribution.WriteOnNewFile"` supports the standard strategy of rolling out code that reads a new format and waiting for it to saturate before beginning to write that new format.
"reading the new format" corresponds to using a container runtime initialized with `mixinAttributor`, and "writing the new format" to enabling `"Fluid.Attribution.WriteOnNewFile"` in configuration.
During the "waiting to saturate" period, developers are free to experiment with turning the feature flag on locally and testing various compatability scenarios.

<!-- AUTO-GENERATED-CONTENT:START (README_FOOTER) -->

<!-- prettier-ignore-start -->
<!-- NOTE: This section is automatically generated using @fluid-tools/markdown-magic. Do not update these generated contents directly. -->

## Minimum Client Requirements

These are the platform requirements for the current version of Fluid Framework Client Packages.
These requirements err on the side of being too strict since within a major version they can be relaxed over time, but not made stricter.
For Long Term Support (LTS) versions this can require supporting these platforms for several years.

It is likely that other configurations will work, but they are not supported: if they stop working, we do not consider that a bug.
If you would benefit from support for something not listed here, file an issue and the product team will evaluate your request.
When making such a request please include if the configuration already works (and thus the request is just that it becomes officially supported), or if changes are required to get it working.

### Supported Runtimes

-   NodeJs ^20.10.0 except that we will drop support for it [when NodeJs 20 loses its upstream support on 2026-04-30](https://github.com/nodejs/release#release-schedule), and will support a newer LTS version of NodeJS (22) at least 1 year before 20 is end-of-life. This same policy applies to NodeJS 22 when it is end of life (2027-04-30).
    -   Running Fluid in a Node.js environment with the `--no-experimental-fetch` flag is not supported.
-   Modern browsers supporting the es2022 standard library: in response to asks we can add explicit support for using babel to polyfill to target specific standards or runtimes (meaning we can avoid/remove use of things that don't polyfill robustly, but otherwise target modern standards).

### Supported Tools

-   TypeScript 5.4:
    -   All [`strict`](https://www.typescriptlang.org/tsconfig) options are supported.
    -   [`strictNullChecks`](https://www.typescriptlang.org/tsconfig) is required.
    -   [Configuration options deprecated in 5.0](https://github.com/microsoft/TypeScript/issues/51909) are not supported.
    -   `exactOptionalPropertyTypes` is currently not fully supported.
        If used, narrowing members of Fluid Framework types types using `in`, `Reflect.has`, `Object.hasOwn` or `Object.prototype.hasOwnProperty` should be avoided as they may incorrectly exclude `undefined` from the possible values in some cases.
-   [webpack](https://webpack.js.org/) 5
    -   We are not intending to be prescriptive about what bundler to use.
        Other bundlers which can handle ES Modules should work, but webpack is the only one we actively test.

### Module Resolution

[`Node16`, `NodeNext`, or `Bundler`](https://www.typescriptlang.org/tsconfig#moduleResolution) resolution should be used with TypeScript compilerOptions to follow the [Node.js v12+ ESM Resolution and Loading algorithm](https://nodejs.github.io/nodejs.dev/en/api/v20/esm/#resolution-and-loading-algorithm).
Node10 resolution is not supported as it does not support Fluid Framework's API structuring pattern that is used to distinguish stable APIs from those that are in development.

### Module Formats

-   ES Modules:
    ES Modules are the preferred way to consume our client packages (including in NodeJs) and consuming our client packages from ES Modules is fully supported.
-   CommonJs:
    Consuming our client packages as CommonJs is supported only in NodeJS and only for the cases listed below.
    This is done to accommodate some workflows without good ES Module support.
    If you have a workflow you would like included in this list, file an issue.
    Once this list of workflows motivating CommonJS support is empty, we may drop support for CommonJS one year after notice of the change is posted here.

    -   Testing with Jest (which lacks [stable ESM support](https://jestjs.io/docs/ecmascript-modules) due to [unstable APIs in NodeJs](https://github.com/nodejs/node/issues/37648))

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
