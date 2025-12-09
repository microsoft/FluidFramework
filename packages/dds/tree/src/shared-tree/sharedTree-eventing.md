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
SharedTree currently has three different events which are used in different combinations to cover the different use cases for observing root / whole document-level changes.
- nodeChanged(node) – direct field mutations of the node
- treeChanged(node) – any mutations in the subtree under the node
- rootChanged – replacement under the root field (new root node)

Apps often care about "whole document-level" changes, and currently this is expressed by combining several existing methods. This makes events for root nodes feel like a special case, and does not feel consistent with our non-root node counterparts.

### Whole document changed
- Listen to “rootChanged”
- Subscribe to treeChanged(rootNode)
- If “rootChanged” fires, re-subscribe to treeChanged(newRootNode)

Additionally, the “rootChanged” event takes in a view (as it does not have a parent node) and triggers for schema changes (which we may or may not want to separate). This makes subscribing to root level events feel inconsistent and less ergonomic compared to other events.

### Proposal

Introduce root level wrapper events which behave like their node-level counterparts which automatically tracks root replacements for resubscribing. These wrapper events do not introduce any new capabilities but only exist to unify the eventing APIs for root nodes vs non-root nodes.

### Potential Solution

#### Option A: `rootNodeChanged` / `rootTreeChanged` as wrapper events
These APIs would mirror `nodeChanged` and `treeChanged`, but operate directly on the rootField (or view). They do not include schema changes (users should use the `schemaChanged` event for this instead), and automatically resubscribes to `nodeChanged` and `treeChanged` with the new root when the root node has been replaced

```ts
treeView.events.on(“rootNodeChanged”, listener, {});
```

```ts
treeView.events.on(“rootTreeChanged”, listener, {});
```

These APIs would eliminate some of the boilerplate from our current workflow and would make the eventing model more consistent between the root and all other nodes. 

| Operation                           | rootChanged | rootNodeChanged  | rootTreeChanged  |
|-------------------------------------|-------------|------------------|------------------|
| Replace root pointer                | Yes         | No               | Yes              |
| Insert/delete/move direct child     | No          | Yes              | Yes              |
| Insert/delete/move anywhere         | No          | No               | Yes              |
| Mutate value/field on root          | No          | Yes              | Yes              |
| Schema change                       | Yes         | No               | No               |

---

### Option B: new `ParentObject` in `nodeChanged` / `treeChanged`
A new `Tree.ParentObject` api would return a type `ParentObject` which is an intersection of the `TreeView` and `TreeNode`, so that we could pass this new type into our existing eventing apis and would unify our special cases for nodes without a parent node.

```ts
type ParentObject = TreeView | TreeNode

parentObject(node: TreeNode): ParentObject {
	if(Tree.parent(node) === undefined){
		// returns view
	}
	return Tree.parent(node)
}

// Example for the rootNode
const parentObject = Tree.parentObject(rootNode)

Tree.on(parentObject, "nodeChanged", () => {})
```

## 2. Diff Payload for nodeChanged 

### Problem

Our event emitters currently tell us whether the node or tree has changed, but it does not specify what specific operation took place. For example, if we emit an event on an arrayNode that underwent an insert operation, it may be useful to know which index the insert occurred at (or what was inserted).

### Proposal

---

#### Option A: Previous Tree State Payload

Provide the previous tree state in the event payload for consumers that opt in. As this feature is something that is requested by a few select customers, it may not be very widely used. If this is the case, simply providing a “node snapshot” of the previous tree state, and letting the users decide what to do may be the easiest solution.

However, this solution can potentially be expensive (especially for large subtrees), and we would need to investigate the following:
- The shape of the snapshot (e.g. actual nodes vs serialized JsonableTree)
- difference in performance cost between `ObjectForest` vs `ChunkedForest`

We may consider the following to represent the previous tree state:
- JsonableTree representation of node/subtree
- clone of the node

Using actual node clones which are valid for the lifetime of the event likely makes the most sense, as it would be a slightly better user experience.

```ts
// Option A: JsonableTree
(prev, curr) => {
	const convertedPrev = TreeAlpha.convertJsonableTreeToNode(MySchema, prev) // Or whatever the convert method may be called
	if(convertedPrev.foo.bar !== convertedPrev.foo.bar){
		// Update my cache
	}
}

// Option B: clone of the node
(prev, curr) => {
	if(prev.foo.bar !== prev.foo.bar){
		// Update my cache
	}
}
```

```ts
type NodeSnapshot = unknown // exact type TBD

type NodeChangedEvent = {
	node: NodeHandle;
	changedProperties: Set<string>;
	/**
	 * Lazily includes previous tree state's snapshot for this node, if enabled.
	 * 
	 * This function is optional so that:
	 * - existing event shapes can remain valid if the feature is disabled.
	 * - users can opt-out of paying the performance cost of snapshot support.
	*/
	getPreviousState?: () => NodeSnapshot
}
```

---

#### Non-goal: Exposing Raw deltas

Although exposing the raw deltas may be just as easy to implement (while providing all the information we need), they are too difficult to read/interpret correctly for it to be a viable solution for most users.

---

#### Option B: Normalized Diff Payload

Expose an optional getDiff() function when subscribing to a nodeChanged event, exposing a read-friendly, structured diff payload.

##### Potential Solution

Deltas stores edit information and maybe can be used to provide the diffs for the specific node we’re interested in. However, the information provided from a delta is not always isolated to the specific node, and the format of the deltas is difficult to read and understand.

One way to implement this would be to create some sort of delta transformer function that:
- isolates the relevant parts of the delta for a given node
- converts it to a read-friendly format. 

This data can then be sent through the payload when emitting the event.

The existing trackDirtyNodes function can be leveraged to determine which nodes changed during the batch so that the delta transformer only computes the diffs for those nodes.

We should also compute diffs once per transaction and expose them lazily or behind an `{includeDelta: true}` flag to avoid payload bloat. 

By default, diffs would represent the net effect of all the edits in an event. For example, an insert -> delete -> insert sequence for the same position would be represented as a single insert. We may also consider an optional `squashDiffs` flag to opt-in to getting the entire edit history if there are use cases for this (may be useful in certain debugging scenarios). This would allow users to decide if they value performance vs full edit history.

```ts
/**
 * Diff for sequence/array-like fields
 * 
 * Note: Includes `retain` operation and `attributes` map to future-proof rich-text sequences. The operation set is designed to be compatible with Quill.js Delta semantics. `retain` operations do not contain an index, as it is just used to advance the position when Quill processes its deltas.
*/
type SequenceFieldDiff<TValue> = 
	| {kind: “insert”; index: number; content: TValue[]; attributes?: Record<string, unknown>}
	| {kind: “delete”; index: number; count: number}
	| {kind: “move”; srcIndex: number; count: number; dstIndex: number}
	| {kind: “set”; oldValue: TValue; newValue: TValue, index: number }
	| {kind: "retain"; count: number; attributes?: Record<string, unknown>}

/**
 * Diff for map-like fields
*/
type MapFieldDiff<TValue> =
	| {kind: “insert”; key: string; content: TValue}
	| {kind: “delete”; key: string; oldValue: TValue}
	| {kind: “set”; oldValue: TValue; newValue: TValue, key: string }

/**
 * Diff for leaf value fields
*/
type ValueFieldDiff<TValue> = {
	kind: “set”; 
	oldValue: TValue; 
	newValue: TValue, index: number
}

type FieldDiff<TValue> =
	| SequenceFieldDiff<TValue>
	| MapFieldDiff<TValue>
	| ValueFieldDiff<TValue>

/*
 * Example read-friendly diff  
*/
interface ReadableDiff {
	node: NodeHandle;
	fields?: Record<FieldKey, FieldDiff[]>;
	squashDiffs?: boolean = true;
	meta?: {origin: "localChange" | "localRebase" | "localMerge" | "remoteChange" }
}

type NodeChangedEvent = {
	node: NodeHandle;
	changedProperties: Set<string>;
	getDiff?: () => ReadableDiff | undefined
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

---

## 2.1 JSON Patch Export

JSON Patch can also be a good solution which provides a standardized, well documented format for the delta. However, JSON Patch is not an ideal representation of SharedTree's richer diff semantics.

Some examples of JSON Patch limitations include:
- A single multi-node operation needs to be represented as multiple JSON Patch operations. If we had a single insert operation with 100 nodes, JSON Patch would have to break this down into 100 different insert operations to represent this. This may be unacceptable for things like text editing.
- "replace" operation does not record the old value, which may become an issue if we round trip this operation.
- Metadata like "origin" is lost.

For these reasons, JSON Patch should be complementary to ReadableDiff by providing a standardized, external friendly view of the changes. ReadableDiff can preserve SharedTree semantics, while JSON Patch can be used for interop use cases.

### API Options

#### Embed in readableDiff

```ts
interface ReadableDiff {
	node: NodeHandle;
	fields?: Record<FieldKey, Diff[]>;
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
	getDiff?: () => ReadableDiff | undefined
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

Provide a sparse tree with the changed nodes in the payload. We can also use the delta for this case. We would need to traverse through the delta while constructing the sparse tree and include only nodes with subtrees that have changed.

##### Open questions

###### Which subtree-level queries are most useful for users?
TODO: We should validate this with Nick before finalizing payload shape.
- Given a node, how did this node change?
- Given a path, did anything change at or under this path?
- Explore / discover which paths changed anywhere in this subtree.
- Given a node, which fields have any changes in their subtree?

###### How do we represent move diffs involving multiple subtrees?
Given that we have a subtree which goes through a bunch of edits, and then gets moved under a different subtree, do we represent the net diff as an insert into the new subtree (and just use the final state before it got moved)?

`trackDirtyNodes` already maintains a map of nodes to the `DirtyTreeStatus`. A subtree diff type could leverage this into a map of node/path -> summary, where the summary describes how the node changed and optionally exposes richer diffs on demand.

This representation could also be used in a separate `onFieldEdited` event as this sparse subtree structure provides:
- which fields experienced direct updates
- which fields had any changes in their subtrees.
```ts

// Per-node change summary used within the sparse subtree.
interface ChangeSummary {
	status: NodeChangeStatus

	// Optional per-field diffs for this node.
	// This should be omitted or lazy by default to keep size minimal.
	fields?: Record<FieldKey, FieldDiff<TNode>[]>
}

// Conceptual views of the sparse payload
type NodeChangeMap<TNode> = Map<TNode, Status>
type PathChangeMap = Map<UpPath, Status>

interface SparseSubtree {
	/**
	 * Root path of the subtree being summarized.
	*/
	root: UpPath;

	/**
	 * Changed nodes within the subtree. Each entry has:
	 * - the node's path
	 * the summary of how the node changed.
	*/
	nodes: Array<{
		path: UpPath;
		summary: ChangeSummary
	}>
}
```

---

#### Option B: Flat List

Provide a list of UpPaths of the nodes changed. 

```ts
interface FlatSubtree {
	root: UpPath;
	changed: UpPath[];
}
```

---

#### Option C: Aggregate Summary

Provide a summary of the counts of inserted/removed/moved nodes. Although this will give us the least information out of the three solutions, it may have use cases without costing too much development time.

This is likely only useful in more niche monitoring/analytics scenarios, and would probably be implemented on top of a richer diff representation rather than a standalone solution.

```ts
interface SubtreeAggregateSummary {
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
	getSubtreeDiff?: () => SparseSubtree | FlatSubtree | SubtreeAggregate | undefined;
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

## 4. Event Coalescing

### Current Batching Mechanisms

The current event batching system provides two mechanisms
1. Transactions - semantic grouping of edits
- Groups multiple edits/operations into a single atomic unit. 
- Ensures consistent commit behavior for remote changes.
- Not intended as a batching mechanism, where batching is a side effect.
2. eventBuffer (internal)
- allows internal buffering of TreeNodeEvents to prevent event spam and present atomic operations (e.g. Table Schema operations).
- This feature is not available to the public, as it could be dangerous if misused.

These mechanisms affect how SharedTree emits events, but not how applications choose to react to these events. This can cause applications to have unnecessary re-renders.

### Proposal

SharedTree should expose a minimal public batching hook that lets users buffer events and decide when to flush them. This provides users more flexibility on how they would want to batch their events.

Nots: This proposal is unrelated to the internal `eventBuffer`. `eventBuffer` buffers internal events to present atomic SharedTree operations, whereas this proposal buffers application-level reactions and does not modify the SharedTree's event semantics.

### Potential Solution

Expose a batched variant of the node/tree change events that buffers notifications until the consumer explicitly flushes them:

```ts
// Only fires when flush is called.
const {flush, off } = Tree.on(node, "nodeChangedBatched", listener)
```

Users can then build their own coalescing strategies on top of this. For example:

```ts
// Sets up the batch event
const {flush, off} = Tree.on(node, "nodeChangedBatched", onChanged);

let scheduled = false
Tree.on(node, "nodeChanged", () => {
	// First event triggered will set scheduled to true. Subsequent events will do nothing.
	// requestAnimationFrame (built in browser API) waits until the frame is finished, sets scheduled back to false (for next batch), and flushes the current batch.
	if(!scheduled) {
		scheduled = true;
		requestAnimationFrame(() => {
			scheduled = false
			flush()
		})
	}
});
```
---

## Next Steps
- Event ordering (rootNodeChanged) – investigate which order the events get emitted when there are multiple overlapping events that are on. For example, when nodeChanged and treeChanged events are both on, nodeChanged will emit first. There is a recent feature that delays events. Check how that new feature handles ordering for rootNodeChanged events.
- Incorrect/stale diffs when subscribing to an event on a node part of a batch being processed. What would the resulting diff look like?

---

## Final Thoughts

The proposals in this document represent a more feature rich and unified eventing system, covering semantic completeness (detached trees), developer ease (structured diffs), and runtime efficiency (rAF coalescing). The following recommendations outline a practical roadmap for these proposals.
1.	Prioritize `Tree.parentObject`. It may be beneficial to getting this done soon, as it will be easy to implement, and will provide future work to be unblocked.
2.	Then root level events, as either proposed solution (wrapper vs using new parentObject) would make our api usage more consistent.
3.	Combine diff and JSON Patch Payloads for Node Changes. Although the demand for this feature may be to a limited number of customers (and simply passing in the raw delta may be the easiest solution), this provides users with better readability (normalized diffs) and interoperability (as JSON Patch is a standardized format). If this feature is time sensitive, we can also consider initially implementing the feature with the previous tree state, then upgrading it in the future.
4.	Expand to subtree diff payloads (prefer sparse representation). Once the node layer diff format is finalized, the subtree layer format should be implemented next. The sparse tree format is recommended as the default, as it provides the richest context. TODO: We need to validate this with Nick before finalizing the payload.
5.	Defer detached tree eventing until editing is supported. Unfortunately, this work will remain blocked until editing is possible for detached nodes.
6.	Treat event coalescing as the lowest priority task. This feature provides optimization for UI heavy scenarios but introduces no new capabilities. This should likely stay in the backlog until all the higher priority features have landed.

## Appendix

### Limitations of `trackDirtyNodes`
The current `trackDirtyNodes` function allows us to tracking which nodes were touched during an edit. However, there are several gaps that limit its ability to become a public facing api. Some of these limitations will be covered by the design choices proposed in this document.

1. Incomplete edit semantics (`DirtyTreeStatus`)
`DirtyTreeStatus` only distinguishes `"new" | "changed" | "moved"`, which does not cover several forms of edits supported by SharedTree, including:
- attach/detach operations outside of arrays
- moves in map fields
- node structural replacement from schema changes
- swap operations

However, the diff formats proposed in this document (e.g. `SequenceFieldDiff`, `MapFieldDiff`, `ValueFieldDiff`, `SparseSubtree`) provide schema-agnostic, semantically complete edit types. `trackDirtyNodes` should therefore only be leveraged to check "which nodes were touched", and not anything else.

2. Node replacement from schema changes
Schema changes can cause new `TreeNode` instances to be created even when no semantic "edit" occurred in the tree. `trackDirtyNodes` cannot reliably differentiate between:
- node replacement due to a structural schema upgrade
- node replacement due to user edits
- rehydration during snapshot load or rebase

This makes it difficult to use `DirtyTreeStatus` as the basis for observable behavior.

The proposed APIs address this by keeping schema changes explicitly separate (via `schemaChanged`) and by introducing root-level wrapper events (`rootNodeChanged`/`rootTreeChanged`) that simplify root replacement logic.

3. Unsafe timing: mid-edit observability
`trackDirtyNodes` fires callbacks during forest mutation. At this point:
- edits may be partially applied
- tree invariants are not yet restored

Running user code during this phase may cause undefined paths and inconsistent reads. The proposals in this document addresses this doing the following:
- subscription changes made during a callback do not affect the current batch
- diffs represent the final and net state of the edits
- New listeners registered from within an event callback will only see subsequent batched/transactions and will not receive diffs for edits that have already been applied.

4. Exposure of internal "Forest" concepts
The existing `trackDirtyNodes` documentation reference "forest", which are not part of the public API. The proposed APIs will therefore only operate with publicly exposed types:
- UpPath
- per-field diffs (new type)
- new ParentObject abstraction type
