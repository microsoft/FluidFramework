# @fluid-internal/attributor

This package contains definitions and implementations for framework-provided attribution functionality.

## Quickstart

To turn on op-stream based attribution in your container, use `mixinAttributor` to create a `ContainerRuntime` class which supports querying for attribution information.

```typescript
import { ContainerRuntime } from "@fluidframework/container-runtime";

const ContainerRuntimeWithAttribution = mixinAttributor(ContainerRuntime);

// ...then, in your ContainerRuntime factory use this class:
class ContainerRuntimeFactory implements IRuntimeFactory {
    public async instantiateRuntime(context: IContainerContext, existing?: boolean): Promise<IRuntime> {
        const runtime = await ContainerRuntimeWithAttribution.load(
            /* same arguments you would have provided to ContainerRuntime.load */
        );
        // do whatever setup is necessary with the runtime here
        return runtime;
    }
}
```

TODO: document any settings you need to turn on to get DDSes to track attribution

This will cause documents created with this container runtime to store associations which attribute document content to timestamp/user information.

Applications can recover this information using APIs on the DDSes they use. For example, the following code snippet illustrates how that works for `SharedString`:

```typescript
function getAttributionInfo(attributor: IRuntimeAttribution, sharedString: SharedString, pos: number): AttributionInfo {
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

> Note: backwards-compatibility for using this mixin with existing documents is a work in progress.
> When an existing document is loaded that was created using a ContainerRuntimeFactory without a mixed in attributor,
> that document will continue to operate as if no attribution has been mixed in.
> Additionally, if a document that contains attribution is loaded using a container runtime without a mixed-in attributor,
> any attribution information stored in that document may be lost.
> The current implementation is thus suitable for prototyping/feature development, but shouldn't be rolled out to users that
> expect production-quality attribution.

## Overview

Attribution is inherently a content-based operation--it answers questions about who created or changed a piece of content as well as when they did it.
Since applications typically want attribution at a relatively fine-grained level, DDSes are the initial entrypoint for attributing content.
A DDS may define its attribution API as it sees fit, but should somehow expose a way to retrieve attribution keys from its content.
These attribution keys can be exchanged for user and timestamp information using the container runtime.

The following DDSes currently support attribution:

- [SharedString](#TODO:Link to merge-tree doc, document any feature flags required if those aren't set up by mixinAttributor somehow)

## Op Stream Attribution

Framework-provided attribution tracks user and timestamp information for each op submitted.
Any more complex scenarios where attribution doesn't align with the direct submitter (such as attributing copy-pasted content to the original creators) should be handled by Fluid consumers using the extensibility points.

## Extensibility Points

`mixinAttributor` provides the ability to register alternative `IAttributor` implementations which aren't op-based.
There is currently no API to cause creation of those `IAttributor`s, but there are plans to allow this.
A container runtime with mixed-in attribution capabilities would then support having multiple attributors with different
associated IDs.

Such an API would be useful for a couple scenarios:

- Association of data to users which haven't opened the current document (ex: cut-and-paste from a nested document into
  the outer document while preserving op-based attribution on the inner document)
- Migrating attribution data in some format that precedes the framework-provided one

Note that attributor creation and modification doesn't cause any data to be sent to other clients, so to ensure all clients agree on attribution state,
the set of attributors associated with a runtime as well as the keys those attributors contain should only contain data derivable from the op stream.
