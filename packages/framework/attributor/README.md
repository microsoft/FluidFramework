# @fluidframework/attributor

This package contains definitions and implementations for framework-provided attribution functionality.

## Quickstart

To turn on op-stream based attribution in your container, use `mixinAttributor` to create a `ContainerRuntime` class which supports querying for attribution information.
When you instantiate your container runtime, pass a scope which implements `IProvideRuntimeAttributor`.

```typescript
import { ContainerRuntime } from "@fluidframework/container-runtime";
import { mixinAttributor, createRuntimeAttributor } from "@fluidframework/attributor";

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
): AttributionInfo {
	const { segment, offset } = sharedString.getContainingSegment(pos);
	if (!segment || !offset) {
		throw new UsageError("Invalid pos");
	}
	const attributionKey: AttributionKey = segment.attribution.getAtOffset(offset);
	return attributor.getAttributionInfo(attributionKey);
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
