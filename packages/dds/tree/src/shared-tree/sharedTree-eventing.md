# SharedTree Eventing System Enhancements

# Summary

The SharedTree eventing layer currently provides great, but limited APIs for observing state changes. This document proposes several enhancements to the SharedTree eventing system in the Fluid Framework, as well as covering some of its current limitations. 

These enhancements aim to improve:
- Consistent, ergonomic root-level and document-level change events.
- Diff payloads for nodeChanged and treeChanged events
- Subtree diff representations (Sparse, Flat, Aggregate Summary)
- Support for detached tree events

---

## Current State
We currently have many different tree related event emitters from different layers of the tree. Here’s a summary of our APIs.

| Layer      | API                             | Trigger                                             | Example Use-case                                      |
|------------|----------------------------------|------------------------------------------------------|--------------------------------------------------------|
| View       | `rootChanged`                    | Root field reassigned / schema change               | Handle schema updates, or reset root                  |
| View       | `schemaChanged`                  | Stored schema changed                                | Ensure type-dependent tree contents, re-check compatibility |
| View       | `commitApplied`                  | Local commit landed / transaction committed          | Wire undo/redo via revertible                          |
| TreeBeta   | `nodeChanged`                    | Node’s direct fields/values changed                  | Check which specific field changed via `changedProperties` |
| TreeBeta   | `treeChanged`                    | Subtree changed                                      | Detect updates under a subtree                         |
| Flex-tree  | `nodeChanging` / `subtreeChanging` | Node or subtree is in process of change           | Detect node/subtree changes before applying            |
| Flex-tree  | `nodeChanged` / `treeChanged`     | Node or subtree changed                            | Detect applicable updates                              |
| TreeAlpha  | `trackObservations` / `trackObservationsOnce` | Change tracking | Invalidation-based processing (React re-render) |
| Checkout   | `beforeBatch`                    | Before a group of edits is applied                   | Tree may be unstable                                   |
| Checkout   | `afterBatch`                     | After group of edits is applied                      | Tree stable again                                      |

---

# Proposed Enhancements

---

## 1. Root Events: `rootNodeChanged` / `rootTreeChanged`

### Problem
SharedTree currently has three different events which are used in different combinations to cover the different use cases for observing root / whole document level changes.
- nodeChanged(node) – direct field mutations of the node
- treeChanged(node) – any mutations in the subtree under the node
- rootChanged – replacement under the root field (new root node)

Currently there is no single API that covers root field level mutations or “whole document” changes. Instead, our current way to do this are the following.

### Root field level mutations**
- Listen to “rootChanged”
- Subscribe to nodeChanged(rootNode)
-  If “rootChanged” event fires, re-subscribe to nodeChanged(newRootNode)

### Whole document changed**
- Listen to “rootChanged”
- Subscribe to treeChanged(rootNode)
- If “rootChanged” fires, re-subscribe to treeChanged(newRootNode)

Additionally, the “rootChanged” event takes in a view (as it does not have a parent node) and triggers for schema changes (which we may or may not want to separate). This makes subscribing to root level events feel inconsistent and less ergonomic compared to other events.

### Proposal

Introduce root level wrapper events which behave like their node-level counterparts which automatically tracks root replacements for resubscribing. These wrapper events do not introduce any new capabilities but only exist to unify the eventing APIs for root nodes vs non-root nodes.

### Potential Solution

#### rootNodeChanged/rootTreeChanged
These APIs would mirror nodeChanged, but can optionally omit schema changes, and can automatically:
- Detect root replacement
- Unsubscribe to old root
- Resubscribe to new root

```ts
treeView.events.on(“rootNodeChanged”, listener, {
resubscribeOnRootReplace: boolean;
includeSchemaChanges?: boolean;
});
```

```ts
treeView.events.on(“rootTreeChanged”, listener, {
resubscribeOnRootReplace: boolean;
includeSchemaChanges?: boolean;
});
```

These APIs would eliminate some of the boilerplate from our current workflow and would make the eventing model more consistent between the root and all other nodes. 

| Operation                           | rootChanged | rootNodeChanged | rootTreeChanged |
|-------------------------------------|-------------|------------------|------------------|
| Replace root pointer                | Yes         | Yes*             | Yes*             |
| Insert/delete/move direct child     | No          | Yes              | Yes              |
| Insert/delete/move anywhere         | No          | No               | Yes              |
| Mutate value/field on root          | No          | Yes              | Yes              |
| Schema change                       | Yes         | Optional         | Optional         |

\*when `resubscribeOnRootReplace = true`

Note: When includeSchemaChanges is false, rootNodeChanged/rootTreeChanged fires only for structural or field-level changes, not schema-only changes. 

---

## 2. Diff Payload for nodeChanged 

### Problem

Our event emitters currently tell us whether the node or tree has changed, but it does not specify what specific operation took place. For example, if we emit an event on an arrayNode that underwent an insert operation, it may be useful to know which index the insert occurred at (or what was inserted).

### Proposal

---

#### Option A: Previous Tree State Payload

Provide the previous tree state in the event payload. As this feature is something that is requested by a few select customers, it may not be very widely used. If this is the case, simply providing a “node snapshot” of the previous tree state, and letting the users decide what to do would be the easiest way.

We may consider the following to represent the previous tree state:
	- JsonableTree representation of node/subtree
	- shallow structural clone

```ts
type NodeSnapshot = unknown // exact type TBD

type NodeChangedEvent = {
	node: NodeHandle;
	changedProperties: Set<string>;
	getPreviousState?: () => NodeSnapshot | undefined
}
```

---

#### Non-goal: Exposing Raw deltas

Although exposing the raw deltas may be just as easy to implement (while providing all the information we need), they are too difficult to read/interpret correctly for it to be a viable solution.

---

#### Option B: Normalized Diff Payload

Expose an optional getDiff() function when subscribing to a nodeChanged event, exposing a read friendly, structured and versioned diff payload.

##### Potential Solution

Deltas stores edit information and maybe can be used to provide the diffs for the specific node we’re interested in. However, the information provided from a delta is not always isolated to the specific node, and the format of the deltas is difficult to read and understand.

One way to implement this would be to create some sort of delta transformer function to isolate the relevant parts of the delta that we need and converts it to a read-friendly format. This data can then be sent through the payload when emitting the event. A stable versioned schema for diff payloads should also be considered to decouple it from our internal change formats.

The existing trackDirtyNodes function can be leveraged to determine which nodes changed during the batch so that the delta transformer only computes the diffs for those nodes.

We should also compute diffs once per transaction and expose them lazily or behind an `{includeDelta: true}` flag to avoid payload bloat. 

```ts
type DiffV1 = 
	| {kind: “insert”; index: number; content: NodeHandle[]}
	| {kind: “delete”; index: number; count: number}
	| {kind: “move”; srcIndex: number; count: number; dstIndex: number}
	| {kind: “set”; oldValue: unknown; newValue: unknown }
interface ReadableDiffV1 {
	version: 1;
	node: NodeHandle;
	fields?: Record<FieldKey, DiffV1[]>;
	truncated?: boolean;
	meta?: {origin: “local” | “remote”, revision: RevisionTag} // unsure if this is necessary
}

type NodeChangedEvent = {
	node: NodeHandle;
	changedProperties: Set<string>;
	getDiff?: () => ReadableDiffV1 | undefined
}
```

---

##### Open Considerations: Event Subscription Timing
Listeners may be added or removed while events are being processed, which may lead to strange behavior if we do not clearly define it. For example, we may have a weird case where we’re in the middle of processing a transaction/batch, and inside an event callback we do this.

```ts
node.events.on(“nodeChanged”, newListener)
```

To simplify, we may consider the following:

Minimum behavior:
- Subscription changes (add/remove) that occur during the processing of a batch do not affect the current batch.
- New listeners registered from within an event callback will only see subsequent batched/transactions and will not receive diffs for edits that have already been applied.
Additional guidance:
- Document a warning that discourages registering listeners from within an event callback will only observe future batches.
Stricter alternative:
- Disallow registering listeners from within an event callback completely.

---

## 2.1 JSON Patch Export

JSON Patch can also be a good solution which provides a standardized, well documented format for the delta. However, JSON Patch isn’t completely lossless and can lose some of our edit semantics. 

Some of the information that can be lost in JSON Patch are:
- multi-count moves
- set (JSON Patch replace has no “old value”)
- metadata

JSON Patch complements ReadableDiffV1 by providing a standardized, external friendly view of the changes. ReadableDiffV1 could be used for use cases that can benefit from a more detailed diff (preserving SharedTree specific semantics), whereas JSON Patch can be used for interop use cases.

### API Options

#### Embed in readableDiffV1

```ts
interface ReadableDiffV1 {
	version: 1;
	node: NodeHandle;
	fields?: Record<FieldKey, DiffV1[]>;
	truncated?: boolean;
	meta?: {origin: “local” | “remote”, revision: RevisionTag} // unsure if this is necessary
	jsonPatch?: JsonPatchOp[]
}
```

#### Provide a separate accessor

```ts
type NodeChangedEvent = {
	node: NodeHandle;
	changedProperties: Set<string>;
	getDiff?: () => ReadableDiffV1 | undefined
	getJsonPatch?: () => JsonPatchOp[] | undefined
}
```

---

## 3. Diff Payload for subtreeChanged

### Problem

Currently “treeChanged” only signals that something under a node changed, but users have no visibility on which nodes have changed (or what the changes were). 

### Proposal

---

#### Option A: Sparse Tree

Provide a sparse tree with the changed nodes, in the payload. We can also use the delta for this case. We would need to traverse through the delta while constructing the sparse tree and provide it in the payload.

```ts
interface SparseSubtreeV1 {
	version: 1
	root: UpPath;
	nodes: Array<{
		path: UpPath;
		fields?: Record<string, DiffV1[]> // Use UpPath if we only care if it changed
	}>
	truncated: boolean
}
```

---

#### Option B: Flat List

Provide a list of UpPaths of the nodes changed. If we feel like the size of the list can become an issue for large subtrees, we can also have configuration settings to bound the number of nodes changed to “first n edits”. 

```ts
interface FlatSubtreeV1 {
	version: 1;
	root: UpPath;
	changed: UpPath[];
	truncated?: boolean;
}
```

---

#### Option C: Aggregate Summary

Provide a summary of the counts of inserted/removed/moved nodes. Although this will give us the least information out of the three solutions, it may have use cases without needing much additional resources.

```ts
interface SubtreeAggregateSummaryV1 {
	version: 1
	root: UpPath;
	counts: {
		inserted: number;
		deleted: number;
		moved: number;
		set: number;
	};
}
```

---

##### Configuration Options
- maxNodesInDiff/maxDepth – if we want to bound it for large subtrees.
- includeDiffPerNode – if we want the actual changes, or just if they changed
- getSubtreeDiff() – to only compute the diffs when necessary
- getSubtreeJsonPatch() – if we want a standardized format for the diffs

```ts
type TreeChangedEvent = {
	node: NodeHandle;
	getSubtreeDiff?: () => SparseSubtreeV1 | FlatSubtreeV1 | SubtreeAggregate | undefined;
	getSubtreeJsonPatch?: () => JsonPatchOp[] | undefined
}
```

#### Tradeoffs
| Approach        | Size  | Detail  | Ideal for                                  |
|-----------------|-------|---------|---------------------------------------------|
| Sparse Subtree  | Large | High    | Edit information reliant use cases          |
| Flat List       | Medium| Medium  | Checking which nodes changed                |
| Aggregate       | Small | Low     | metrics, dashboards                         |

---

## 4. Detached Tree Eventing

### Problem

Detached trees are currently not able to emit events. When editing for detached trees are enabled, we should ensure that eventing for detached trees reaches parity with our current live-tree eventing system. Note that detached trees do not have “root replacement” semantics. EventParent is only used to determine the event source, not to support root replacement logic for detached trees.

### Potential Solution

#### EventParent
To unify handling of events for nodes that do not have a true parent (root node, detached nodes), we may also introduce an internal helper abstraction called EventParent. 

```ts
interface EventParent{
	branch:TreeView | TreeBranch
	node?: TreeNode
	rootFieldKey?: FieldKey
	detachedRootId?: DetachedNodeId
}
```

This API would return some dummy parent object (EventParent) that has all the necessary components to track changes on its child node. If the node is parented under another node, we can simply use its parent node. 

However, for nodes without a parent node (detached trees / root node), one potential solution could be to design some sort of object that contains different properties for the different scenarios. 

For instance, although root nodes and detached nodes do not have a parent node, it is still technically parented by the view/branch. For these cases, we could have the object contain the view/branch (and maybe the detachedRootId/rootFieldKey) to identify what exactly we are trying to subscribe to. We can return a parent-like object for eventing purposes, to cover all different scenarios.

---

## 5. RequestAnimationFrame (rAF) Coalescing

### Problem

The current event batching system provides two mechanisms
	- Transactions – groups multiple edits/operations into a single atomic unit for consistent commit behavior. Note that this is only for events from remote clients (not local), and is more of a side effect of the transaction (and not its intended goal)
	- eventBuffer (internal) – allows internal buffering of TreeNodeEvents to prevent event spam and present atomic operations (e.g. Table Schema operations). This feature is not available to the public, as it could be dangerous if misused.

While these mechanisms can coalesce event emission at the SharedTree layer, user facing listeners (e.g. UI renderers) can still receive many grouped events at a rapid rate. Some example scenarios may be:
	- Multiple transactions occur within a single frame
	- Several event types (nodeChanged, treeChanged, rootNodeChanged) trigger overlapping responses
	- Listeners at different layers (UI update vs telemetry) compete for time to react

This can lead to unnecessary re-renders or repeated computations per frame.

### Proposal

Provide a feature to batch event reactions using the browser’s requestAnimationFrame API. The events will all still get emitted at the same rate but would be flushed once per frame based on the priority of the event type. This minimizes per-frame computation and may provide a smoother UI experience.

### Potential Solution

When we have a nodeChanged / treeChanged event trigger, we do not render the changes immediately but rather mark these nodes as “unrendered”. Using the requestAnimationFrame API, we can then schedule a flush. On the next frame, group all of these “unrendered” nodes into a batch, and execute all the listeners in order of priority.
	- High priority – edits that affect the tree state
	- Normal priority – UI listener that listens to edits that affect the tree
	- Low priority – Logging/telemetry events that do not impact UX and are safe to defer.

Once this is done, we can clear the batch for the next frame and repeat the process.

To account for the scenario where lower priority listeners start to accumulate (due to high traffic of high priority events), we can provide a fallback timer to flush these events. The fallback timer would wait until the frame loop stalls (frame rate drops, the tab is in the background, etc.) to flush the backlog of lower priority events.

Additionally, we can also budget a certain amount of time to different priority batches to make sure we don’t have to rely solely on the fallback timer.

#### Challenges
- Overlapping batching – If used alongside eventBuffer, check to make sure that the multiple layers of batching do not cause unnecessary delays. We should use the following batching layers to minimize the risk of this occurring.
- Transactions – defines which edits belong together
-  eventBuffer – optionally pauses/coalesce event emissions for one logical operation to prevent event spam
- rAF coalescing – does not change the semantic grouping of the events, but only the reactions to the events.
- Event ordering – ensure that the ordering of different events (rootChanged, nodeChanged, etc.) remains deterministic.

---

## Next Steps
- Event ordering (rootNodeChanged) – investigate which order the events get emitted when there are multiple overlapping events that are on. For example, when nodeChanged and treeChanged events are both on, nodeChanged will emit first. There is a recent feature that delays events. Check how that new feature handles ordering for rootNodeChanged events.
- Incorrect/stale diffs when subscribing to an event on a node part of a batch being processed. What would the resulting diff look like?

---

## Final Thoughts

The proposals in this document represent a more feature rich and unified eventing system, covering semantic completeness (detached trees), developer ease (structured diffs), and runtime efficiency (rAF coalescing). The following recommendations outline a practical roadmap for these proposals.
1.	Start with root level events, as they may be an easy fix (as we are just creating wrappers for existing events), and will make our eventing APIs more consistent.
2.	Then prioritize getEventParent. It may be beneficial to getting this done soon, as it unblocks future eventing feature work for detached trees.
3.	Combine diff and JSON Patch Payloads for Node Changes. Although the demand for this feature may be to a limited number of customers (and simply passing in the raw delta may be the easiest solution), this provides users with better readability (normalized diffs) and interoperability (as JSON Patch is a standardized format). If this feature is time sensitive, we can also consider initially implementing the feature with the previous tree state, then upgrading it in the future.
4.	Expand to subtree diff payloads (prefer sparse representation). Once the node layer diff format is finalized, the subtree layer format should be implemented next. The sparse tree format is recommended as the default, as it provides the richest context.
5.	Defer detached tree eventing until editing is supported. Unfortunately, this work will remain blocked until editing is possible for detached nodes.
6.	Treat rAF Coalescing as the lowest priority task. This feature provides optimization for UI heavy scenarios but introduces no new capabilities. This should likely stay in the backlog until all the higher priority features have landed.
