# @fluid-tools/client-debugger DDS Visualization

This directory contains a system for describing Fluid Distributed Data Structure (DDS) visuals in a declarative manner, and for communicating incremental updates to those visuals.

This system is designed to be compatible with the message-passing-based approach taken by the debugger, such that consumers can process the visuals however they wish.

-   In particular, this enables tooling that may live in another process; e.g. Chromium Browser Extensions.

## The Flow

For the purpose of demonstrating the intended usage flow of the system, we will be looking at it from the context of the debugger, rather than viewing this system in isolation.

When initializing the debugger, the initializing consumer may optionally provide a root DDS(s) they wish to have visualized by the tooling.
If they do not specify this, then the tooling will not generate any visuals.

To initiate "rendering" (generating visual summary trees), the consumer passes the `GET_ROOT_DATA_VISUALIZATIONS` to request the "root" visual summary.
This call will return a flat list of "handle" nodes, which include a unique identifier assigned by the system for the corresponding DDS.

The handle node is not useful on its own, but consumers can use its ID to request a visual summary of the corresponding DDS from the system.
The `GET_DATA_VISUALIZATION` message is used to request such a "rendering" for an individual DDS.

The flow looks something like the following:

```mermaid
sequenceDiagram
participant Application
participant Debugger
participant Consumer

Application->>Debugger: Initialize debugger
Consumer-->>Debugger: "GET_ROOT_DATA_VISUALIZATIONS"
Debugger->>Consumer: "ROOT_DATA_VISUALIZATIONS" ([handle1, handle2, ..., handleN])
loop renderTrees
	Consumer->>Consumer: renderTree(handle.id)
end
Consumer-->>Debugger: "GET_DATA_VISUALIZATION" (id)
Debugger->>Consumer: "DATA_VISUALIZATION" (visualization)
```

The visual tree for a given DDS will always contain the unique DDS ID (so message consumers can correlate them correctly).
Their data format is likely best described by the code, so we won't go into it in too much depth here.
See `./VisualTree` for a type-wise breakdown.

At a high level, the DDS trees contain:

1.  Their ID
2.  Some root visual metadata
3.  Child trees / values

    -   These children will **always** be either nested visuals describing primitive data or a handle node pointing to another DDS.
        When such a node is encountered, the consumer may post another `GET_DATA_VISUALIZATION` message requesting the corresponding "rendering".

### Example

For an example, consider a relatively simple application "schema", which is provided to the debugger at initialization:

```typescript
{
	rootMap: SharedMap;
}
```

The application represents its state as a single root `SharedMap`, whose child values are numeric counters, backed by `SharedCounter`s.

To visualize the entire tree, the flow might look something like the following:

```mermaid
sequenceDiagram
participant Application
participant Debugger
participant Consumer

Application->>Debugger: Initialize debugger
Consumer-->>Debugger: "GET_ROOT_DATA_VISUALIZATIONS"
Debugger->>Consumer: "ROOT_DATA_VISUALIZATIONS" ([rootMapHandle])
loop renderTrees
	Consumer->>Consumer: renderTree(rootMapID)
end
Consumer-->>Debugger: "GET_DATA_VISUALIZATION" (rootMapID)
Debugger->>Consumer: "DATA_VISUALIZATION" (rootMapVisualTree)
loop renderTrees
	Consumer->>Consumer: renderTree(rootMapID)
	loop renderTree
		Consumer-->>Debugger: "GET_DATA_VISUALIZATION" (childCounterId)
		Debugger->>Consumer: DATA_VISUALIZATION (counterVisualTree)
	end
end
```
