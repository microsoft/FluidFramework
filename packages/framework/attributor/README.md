# @fluid-experimental/attributor

This package contains definitions and implementations for framework-provided attribution functionality.

<!-- AUTO-GENERATED-CONTENT:START (LIBRARY_README_HEADER) -->

<!-- prettier-ignore-start -->
<!-- NOTE: This section is automatically generated using @fluid-tools/markdown-magic. Do not update these generated contents directly. -->

**IMPORTANT: This package is experimental.**
**The APIs can change without notice.**

**Do not use this package in production.**

## Using Fluid Framework libraries

For a dependency on a Fluid Framework library's public APIs, we recommend a `^` (caret) version range.
For example, use `^1.3.4`.
Fluid Framework libraries can use different version ranges for dependencies on other Fluid Framework libraries.
For dependencies in your application, we recommend a `^` version range.

For a dependency on an unstable API, such as a `beta` API, we recommend a more restrictive version range.
For example, use a `~` version range.

## Installation

Run this command to install the package:

```bash
npm i @fluid-experimental/attributor
```

## API Documentation

Read the **@fluid-experimental/attributor** API documentation at <https://fluidframework.com/docs/apis/attributor>.

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

Fluid Framework client libraries support the platforms in this document.
These requirements are intentionally restrictive.
Within a major version series, we can relax these requirements, but we cannot make them stricter.
For a Long Term Support (LTS) version, we might need to support these platforms for several years.

Other configurations can work, but Fluid Framework does not support them.
If an unsupported configuration stops working, we do not classify this as a bug.
To request support for a configuration that is not listed, file an issue.
The product team will evaluate your request.
In the issue, specify the current status of the configuration:

-   The configuration works but needs official support.
-   The configuration does not work and requires changes.

### Supported Runtimes

-   Fluid Framework supports Node.js versions 22 and 24 while they receive [upstream support](https://nodejs.org/en/about/previous-releases).
    -   Fluid Framework will stop support for version 22 [when upstream support ends on 2027-04-30](https://github.com/nodejs/release#release-schedule).
    -   Fluid Framework does not support Node.js with the `--no-experimental-fetch` flag.
-   Fluid Framework supports modern browsers that support the ES2022 standard library.

### Supported Tools

-   [TypeScript 6.0](https://typescriptdocs.com/release-notes/TypeScript%206.0):
    -   Fluid Framework supports all [`strict`](https://www.typescriptlang.org/tsconfig) options.
    -   Set the build targets (`lib`, `target`) to `ES2022` or later.
    -   Enable [`strictNullChecks`](https://www.typescriptlang.org/tsconfig).
    -   Fluid Framework does not support [configuration options deprecated in TypeScript 6.0](https://typescriptdocs.com/release-notes/TypeScript%206.0#breaking-changes-and-deprecations-in-typescript-6-0).
    -   Fluid Framework does not fully support `exactOptionalPropertyTypes`.
        If you enable this option, do not use `in`, `Reflect.has`, `Object.hasOwn`, or `Object.prototype.hasOwnProperty` to narrow members of Fluid Framework types.
        These methods can incorrectly exclude `undefined` from the possible values.
-   [webpack](https://webpack.js.org/) 5
    -   We do not require a specific bundler.
        Other bundlers that handle ES Modules can work, but we actively test only webpack.

### Module Resolution

In TypeScript `compilerOptions`, use [`Node16`, `Node20`, `NodeNext`, or `Bundler`](https://www.typescriptlang.org/tsconfig#moduleResolution) module resolution.
These settings follow the [Node.js v12+ ESM Resolution and Loading algorithm](https://nodejs.github.io/nodejs.dev/en/api/v20/esm/#resolution-and-loading-algorithm).

Do not use `Node10` module resolution.

### Module Formats

-   ES Modules:
    Use ES Modules to consume Fluid Framework client packages, including in Node.js.
-   CommonJS:
    Fluid Framework does not officially support CommonJS in version 3.0 or later.

## Contribution Guidelines

You can [contribute](https://github.com/microsoft/FluidFramework/blob/main/CONTRIBUTING.md) to Fluid Framework in these ways:

-   Answer questions in [GitHub Discussions](https://github.com/microsoft/FluidFramework/discussions).
-   [Submit bug reports](https://github.com/microsoft/FluidFramework/issues) and help verify fixes.
-   Review [source code changes](https://github.com/microsoft/FluidFramework/pulls).
-   [Contribute bug fixes](https://github.com/microsoft/FluidFramework/blob/main/CONTRIBUTING.md).

For detailed instructions, read the [Fluid Framework wiki](https://github.com/microsoft/FluidFramework/blob/main/docs/content/Home.md).

This project follows the [Microsoft Open Source Code of Conduct](https://opensource.microsoft.com/codeofconduct/).
For more information, read the [Code of Conduct frequently asked questions](https://opensource.microsoft.com/codeofconduct/faq/).
For questions or comments, contact [opencode@microsoft.com](mailto:opencode@microsoft.com).

This project may contain Microsoft trademarks or logos for Microsoft projects, products, or services.
When you use these trademarks or logos, follow Microsoft's [Trademark and Brand Guidelines](https://www.microsoft.com/trademarks).
Do not use Microsoft trademarks or logos in a modified version of this project if the use causes confusion or implies Microsoft sponsorship.

## Help

Read the [Fluid Framework documentation](https://fluidframework.com/docs/) for information about Fluid Framework concepts and APIs.

To request information that the documentation does not contain, [create an issue](https://github.com/microsoft/FluidFramework/blob/main/docs/content/Contributing/Submitting-Bugs-and-Feature-Requests.md).

## Trademark

This project may contain Microsoft trademarks or logos for Microsoft projects, products, or services.

Use of these trademarks or logos must follow Microsoft's [Trademark & Brand Guidelines](https://www.microsoft.com/en-us/legal/intellectualproperty/trademarks/usage/general).

Use of Microsoft trademarks or logos in modified versions of this project must not cause confusion or imply Microsoft sponsorship.

<!-- prettier-ignore-end -->

<!-- AUTO-GENERATED-CONTENT:END -->
