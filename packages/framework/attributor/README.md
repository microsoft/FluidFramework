# @fluid-experimental/attributor

This package contains definitions and implementations for framework-provided attribution functionality.

<!-- AUTO-GENERATED-CONTENT:START (README_DEPENDENCY_GUIDELINES_SECTION:includeHeading=TRUE) -->

<!-- prettier-ignore-start -->
<!-- NOTE: This section is automatically generated using @fluid-tools/markdown-magic. Do not update these generated contents directly. -->

## Using Fluid Framework libraries

When taking a dependency on a Fluid Framework library, we recommend using a `^` (caret) version range, such as `^1.3.4`.
While Fluid Framework libraries may use different ranges with interdependencies between other Fluid Framework libraries,
library consumers should always prefer `^`.

Note that when depending on a library version of the form `2.0.0-internal.x.y.z`, called the Fluid internal version scheme,
you must use a `>= <` dependency range (such as `>=2.0.0-internal.x.y.z <2.0.0-internal.w.0.0` where `w` is `x+1`).
Standard `^` and `~` ranges will not work as expected.
See the [@fluid-tools/version-tools](https://github.com/microsoft/FluidFramework/blob/main/build-tools/packages/version-tools/README.md)
package for more information including tools to convert between version schemes.

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

<!-- AUTO-GENERATED-CONTENT:START (README_TRADEMARK_SECTION:includeHeading=TRUE) -->

<!-- prettier-ignore-start -->
<!-- NOTE: This section is automatically generated using @fluid-tools/markdown-magic. Do not update these generated contents directly. -->

## Trademark

This project may contain Microsoft trademarks or logos for Microsoft projects, products, or services.

Use of these trademarks or logos must follow Microsoft's [Trademark & Brand
Guidelines](https://www.microsoft.com/en-us/legal/intellectualproperty/trademarks/usage/general).

Use of Microsoft trademarks or logos in modified versions of this project must not cause confusion or imply Microsoft sponsorship.

<!-- prettier-ignore-end -->

<!-- AUTO-GENERATED-CONTENT:END -->
