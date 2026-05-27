/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { createEmitter } from "@fluid-internal/client-utils";
import type { HasListeners, Listenable, Off } from "@fluidframework/core-interfaces/internal";
import {
	assert,
	fail,
	debugAssert,
	unreachableCase,
} from "@fluidframework/core-utils/internal";
import { UsageError } from "@fluidframework/telemetry-utils/internal";

import {
	anchorSlot,
	type AnchorEvents,
	type AnchorNode,
	type DeltaMark,
	type FieldKey,
	type TreeValue,
} from "../../core/index.js";
import { getOrCreateHydratedFlexTreeNode } from "../../feature-libraries/index.js";
import {
	ContextSlot,
	flexTreeSlot,
	LazyEntity,
	TreeStatus,
	treeStatusFromAnchorCache,
	type FlexTreeNode,
	type HydratedFlexTreeNode,
} from "../../feature-libraries/index.js";

import type { Context, HydratedContext } from "./context.js";
import type { TreeNode } from "./treeNode.js";
import type { TreeNodeSchema } from "./treeNodeSchema.js";
import type { InternalTreeNode, Unhydrated } from "./types.js";
import { UnhydratedFlexTreeNode } from "./unhydratedFlexTree.js";

const treeNodeToKernel = new WeakMap<TreeNode, TreeNodeKernel>();

export function getKernel(node: TreeNode): TreeNodeKernel {
	const kernel = treeNodeToKernel.get(node);
	assert(kernel !== undefined, 0x9b1 /* Expected tree node to have kernel */);
	return kernel;
}

/**
 * Detects if the given 'candidate' is a TreeNode.
 *
 * @remarks
 * Supports both Hydrated and {@link Unhydrated} TreeNodes, both of which return true.
 *
 * Because the common usage is to check if a value being inserted/set is a TreeNode,
 * this function permits calling with primitives as well as objects.
 *
 * Primitives will always return false (as they are copies of data, not references to nodes).
 *
 * @param candidate - Value which may be a TreeNode
 * @returns true if the given 'candidate' is a hydrated TreeNode.
 */
export function isTreeNode(candidate: unknown): candidate is TreeNode | Unhydrated<TreeNode> {
	return treeNodeToKernel.has(candidate as TreeNode);
}

/**
 * Returns a schema for a value if the value is a {@link TreeNode}.
 *
 * Returns undefined for other values.
 * @remarks
 * Does not give schema for a {@link TreeLeafValue}.
 */
export function tryGetTreeNodeSchema(value: unknown): undefined | TreeNodeSchema {
	const kernel = treeNodeToKernel.get(value as TreeNode);
	return kernel?.schema;
}

/** The {@link HydrationState} of a {@link TreeNodeKernel} before the kernel is hydrated */
interface UnhydratedState {
	readonly innerNode: UnhydratedFlexTreeNode;
}

/** The {@link HydrationState} of a {@link TreeNodeKernel} after the kernel is hydrated */
interface HydratedState {
	/** The flex node for this kernel */
	readonly innerNode: HydratedFlexTreeNode;
	/** All {@link Off | event deregistration functions} that should be run when the kernel is disposed. */
	readonly offAnchorNode: Set<Off>;
}

/** State within a {@link TreeNodeKernel} that is related to the hydration process */
type HydrationState = UnhydratedState | HydratedState;

/** True if and only if the given {@link HydrationState} is post-hydration */
function isHydrated(state: HydrationState): state is HydratedState {
	return state.innerNode.isHydrated();
}

/**
 * Contains state and an internal API for managing {@link TreeNode}s.
 * @remarks All {@link TreeNode}s have an associated kernel object.
 * The kernel has the same lifetime as the node and spans both its unhydrated and hydrated states.
 */
export class TreeNodeKernel {
	private disposed = false;

	/**
	 * Generation number which is incremented any time we have an edit on the node.
	 * Used during iteration to make sure there has been no edits that were concurrently made.
	 * @remarks
	 * This is updated monotonically by this class when edits are applied.
	 * TODO: update this when applying edits to unhydrated trees.
	 *
	 * If TypeScript supported making this immutable from outside the class without making it readonly from inside, that would be used here,
	 * but they only way to do that is add a separate public accessor and make it private, which was deemed not worth the boilerplate, runtime overhead and bundle size.
	 */
	public generationNumber: number = 0;

	#hydrationState: HydrationState;

	/**
	 * Handler for events listeners registered with the kernel.
	 *
	 * @remarks
	 * Supports event buffering via {@link withBufferedEvents}.
	 *
	 * Allocated lazily on first access to {@link TreeNodeKernel.events}.
	 * We expect the majority of nodes to never have event listeners registered, so
	 * deferring construction avoids per-kernel allocations.
	 */
	#eventBuffer: KernelEventBuffer | undefined;

	/**
	 * Create a TreeNodeKernel which can be looked up with {@link getKernel}.
	 *
	 * @param initialContext - context from when this node was originally created. Only used when unhydrated.
	 * @param innerNode - When unhydrated the MapTreeNode. Otherwise HydratedFlexTreeNode.
	 * @remarks
	 * Exactly one kernel per TreeNode should be created.
	 */
	public constructor(
		public readonly node: TreeNode,
		public readonly schema: TreeNodeSchema,
		innerNode: InnerNode,
		private readonly initialContext: Context,
	) {
		splitInnerNodeType(innerNode);

		assert(!treeNodeToKernel.has(node), 0xa1a /* only one kernel per node can be made */);
		treeNodeToKernel.set(node, this);

		if (innerNode instanceof UnhydratedFlexTreeNode) {
			// Unhydrated case

			debugAssert(() => innerNode.treeNode === undefined);
			innerNode.treeNode = node;

			this.#hydrationState = {
				innerNode,
			};
		} else {
			// Hydrated case
			this.#hydrationState = this.createHydratedState(innerNode);
		}
	}

	public get context(): Context {
		if (isHydrated(this.#hydrationState)) {
			// This can't be cached on this.#hydrated during hydration since initial tree is hydrated before the context is cached on the anchorSet.
			return (
				this.#hydrationState.innerNode.anchorNode.anchorSet.slots.get(SimpleContextSlot) ??
				fail(0xb40 /* missing simple-tree context */)
			);
		}
		return this.initialContext;
	}

	/**
	 * Transition from {@link Unhydrated} to hydrated.
	 * Bi-directionally associates the given hydrated TreeNode to the HydratedFlexTreeNode.
	 * @remarks
	 * Happens at most once for any given node.
	 * Cleans up mappings to {@link UnhydratedFlexTreeNode} - it is assumed that they are no longer needed once this node has an anchor node.
	 */
	public hydrate(inner: HydratedFlexTreeNode): void {
		assert(!this.disposed, 0xa2a /* cannot hydrate a disposed node */);
		assert(!isHydrated(this.#hydrationState), 0xa2b /* hydration should only happen once */);

		this.#hydrationState = this.createHydratedState(inner);

		// Lazily migrate existing event listeners to the anchor node.
		// If no one ever subscribed to this kernel's events, the buffer was never allocated
		// and there is nothing to migrate.
		this.#eventBuffer?.migrateEventSource(inner.anchorNode.events);
	}

	private createHydratedState(innerNode: HydratedFlexTreeNode): HydratedState {
		assert(
			!innerNode.anchorNode.slots.has(simpleTreeNodeSlot),
			0x7f5 /* Cannot associate an flex node with multiple simple-tree nodes */,
		);
		innerNode.anchorNode.slots.set(simpleTreeNodeSlot, this.node);
		return {
			innerNode,
			offAnchorNode: new Set([
				innerNode.anchorNode.events.on("afterDestroy", () => this.dispose()),
				// TODO: this should be triggered on change even for unhydrated nodes.
				innerNode.anchorNode.events.on("childrenChanging", () => {
					this.generationNumber += 1;
				}),
			]),
		};
	}

	public getStatus(): TreeStatus {
		if (this.disposed) {
			return TreeStatus.Deleted;
		}
		if (!isHydrated(this.#hydrationState)) {
			return TreeStatus.New;
		}

		// TODO: Replace this check with the proper check against the cursor state when the cursor becomes part of the kernel
		const flex = this.#hydrationState.innerNode.anchorNode.slots.get(flexTreeSlot);
		if (flex !== undefined) {
			assert(flex instanceof LazyEntity, 0x9b4 /* Unexpected flex node implementation */);
			if (flex.isFreed()) {
				return TreeStatus.Deleted;
			}
		}

		return treeStatusFromAnchorCache(this.#hydrationState.innerNode.anchorNode);
	}

	public get events(): Listenable<KernelEvents> {
		assert(!this.disposed, "Cannot register events on a disposed node");
		// Allocate the buffer on first access. See {@link TreeNodeKernel.#eventBuffer} for rationale.
		if (this.#eventBuffer === undefined) {
			const eventSource = isHydrated(this.#hydrationState)
				? this.#hydrationState.innerNode.anchorNode.events
				: this.#hydrationState.innerNode.events;
			this.#eventBuffer = new KernelEventBuffer(eventSource);
		}
		return this.#eventBuffer;
	}

	public dispose(): void {
		debugAssert(() => !this.disposed || "Cannot dispose a disposed node");
		this.disposed = true;
		if (isHydrated(this.#hydrationState)) {
			for (const off of this.#hydrationState.offAnchorNode) {
				off();
			}
		}
		this.#eventBuffer?.dispose();
		// TODO: go to the context and remove myself from withAnchors
	}

	public isHydrated(): this is { anchorNode: AnchorNode; context: HydratedContext } {
		return isHydrated(this.#hydrationState);
	}

	public get anchorNode(): AnchorNode | undefined {
		return isHydrated(this.#hydrationState)
			? this.#hydrationState.innerNode.anchorNode
			: undefined;
	}

	/**
	 * Retrieves the flex node associated with the given target.
	 * @remarks
	 * For {@link Unhydrated} nodes, this returns the MapTreeNode.
	 *
	 * For hydrated nodes it returns a FlexTreeNode backed by the forest.
	 *
	 * @throws A {@link @fluidframework/telemetry-utils#UsageError} if the node has been deleted.
	 */
	public getInnerNode(): InnerNode {
		if (!isHydrated(this.#hydrationState)) {
			debugAssert(
				() =>
					this.#hydrationState.innerNode?.context.isDisposed() === false ||
					"Unhydrated node should never be disposed",
			);
			return this.#hydrationState.innerNode; // Unhydrated case
		}

		if (this.disposed) {
			throw new UsageError("Cannot access a deleted node.");
		}

		return this.#hydrationState.innerNode;
	}

	/**
	 * Retrieves the {@link UnhydratedFlexTreeNode} if unhydrated. otherwise undefined.
	 */
	public getInnerNodeIfUnhydrated(): UnhydratedFlexTreeNode | undefined {
		if (isHydrated(this.#hydrationState)) {
			return undefined;
		}
		return this.#hydrationState.innerNode;
	}
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const kernelEvents = ["childrenChangedAfterBatch", "subtreeChangedAfterBatch"] as const;

type KernelEvents = Pick<AnchorEvents, (typeof kernelEvents)[number]>;

// #region TreeNodeEventBuffer

/**
 * Stack of active {@link withBufferedTreeEvents} scopes.
 *
 * @remarks
 * Empty when no buffering is active — events from {@link TreeNodeKernel} are emitted immediately.
 *
 * Each entry is a {@link Scope} whose `buffers` set records the {@link KernelEventBuffer}s that
 * have received at least one event during that scope. A buffer is added to the top scope's set
 * lazily on its first event; buffers that never see an event in a given scope do no work at all
 * when that scope ends.
 *
 * The top of the stack is the live scope: incoming events are buffered into it. When a scope
 * ends, only the buffers it touched are visited to merge into the parent scope (nested case),
 * emit accumulated events (outermost case), or discard.
 */
const scopeStack: Scope[] = [];

/**
 * One entry on {@link scopeStack}. Tracks the {@link KernelEventBuffer}s touched during a single
 * {@link withBufferedTreeEvents} call.
 */
interface Scope {
	/**
	 * Buffers that have received at least one event during this scope. Iteration order is
	 * **last-touch** order: each event re-positions its buffer to the end of the set, so the
	 * flush order reflects the most recent batch that touched each buffer. Because the
	 * underlying anchor set always fires descendant events before ancestor events within each
	 * batch, last-touch order yields descendant-before-ancestor emission — matching the
	 * natural (un-buffered) single-batch order documented by
	 * `treeNodeApi.spec.ts > on > cross-node ordering`.
	 */
	readonly buffers: Set<KernelEventBuffer>;
}

/**
 * Call the provided callback with {@link TreeNode}s' events paused until after the callback's completion.
 *
 * Events that would otherwise have been emitted immediately are merged and buffered until after the
 * provided callback has been completed.
 *
 * @remarks
 * Note: this should be used with caution. User application behaviors are implicitly coupled to event timing.
 * Disrupting this timing can lead to unexpected behavior.
 *
 * Nested calls each manage their own buffering scope: each scope's events are merged into the
 * surrounding scope on success or discarded independently if its callback signals discard.
 *
 * @param callback - Function to invoke while events are buffered.
 * Return `true` to discard the events buffered during this call (e.g. when work is being rolled back);
 * return `false`/nothing to keep them.
 * If the callback throws, buffered events are kept.
 */
export function withBufferedTreeEvents(callback: () => boolean | void): void {
	const scope: Scope = { buffers: new Set() };
	scopeStack.push(scope);
	let discard = false;
	try {
		discard = callback() === true;
	} finally {
		const popped = scopeStack.pop();
		assert(popped === scope, "scopeStack out of sync");
		// eslint-disable-next-line unicorn/prefer-at -- Array.at requires ES2022.
		const parent = scopeStack.length > 0 ? scopeStack[scopeStack.length - 1] : undefined;
		// First-touch order matches the natural un-buffered cross-node emission order, so iterate
		// the scope's buffer set as-is for both nested merges and outermost flush.
		for (const buffer of scope.buffers) {
			buffer.endScope(discard, parent);
		}
	}
}

/**
 * One frame of a {@link KernelEventBuffer}'s scope stack. The top of the stack is the live state
 * for the current (innermost) {@link withBufferedTreeEvents} scope; deeper entries are saved
 * outer-scope states waiting to be restored when their corresponding nested call ends.
 */
interface BufferFrame {
	/**
	 * Fields that have changed since events were paused. On flush, this set is delivered as the
	 * `changedFields` of a single `childrenChangedAfterBatch` event.
	 */
	childrenChangedBuffer: Set<FieldKey>;
	/**
	 * Field marks accumulated since events were paused. Emitted alongside `childrenChangedBuffer`
	 * on flush.
	 */
	fieldMarksBuffer: Map<FieldKey, readonly DeltaMark[]>;
	/**
	 * Fields whose marks have been permanently invalidated within the current buffer window due
	 * to two or more separate delta batches touching the same field. Once a key is in this set
	 * it must never be re-added to the marks buffer, even if a third (or later) batch arrives
	 * for that field.
	 */
	invalidatedFieldMarkKeys: Set<FieldKey>;
	/**
	 * Whether the subtree has changed since events were paused. On flush, a single
	 * `subtreeChangedAfterBatch` event is emitted if and only if this is true.
	 */
	subTreeChangedBuffer: boolean;
}

/** Allocate a fresh empty {@link BufferFrame}. */
function createEmptyBufferFrame(): BufferFrame {
	return {
		childrenChangedBuffer: new Set(),
		fieldMarksBuffer: new Map(),
		invalidatedFieldMarkKeys: new Set(),
		subTreeChangedBuffer: false,
	};
}

/**
 * Merge `source`'s contents into `target` using the same collision rules as
 * `KernelEventBuffer.#handleChildrenChangedAfterBatch`: if a field appears in both frames,
 * its marks are permanently invalidated in `target`.
 */
function mergeBufferFrameInto(target: BufferFrame, source: BufferFrame): void {
	for (const key of source.childrenChangedBuffer) {
		target.childrenChangedBuffer.add(key);
	}
	for (const [key, marks] of source.fieldMarksBuffer) {
		if (target.invalidatedFieldMarkKeys.has(key)) {
			continue;
		}
		if (target.fieldMarksBuffer.has(key)) {
			target.fieldMarksBuffer.delete(key);
			target.invalidatedFieldMarkKeys.add(key);
		} else {
			target.fieldMarksBuffer.set(key, marks);
		}
	}
	for (const key of source.invalidatedFieldMarkKeys) {
		target.fieldMarksBuffer.delete(key);
		target.invalidatedFieldMarkKeys.add(key);
	}
	if (source.subTreeChangedBuffer) {
		target.subTreeChangedBuffer = true;
	}
}

/**
 * Event emitter for {@link TreeNodeKernel}, which optionally buffers events based on whether a
 * {@link withBufferedTreeEvents} scope is active.
 *
 * @remarks
 * When {@link scopeStack} is empty, incoming source events are forwarded immediately.
 * Otherwise the buffer lazily allocates a frame the first time it sees an event in the current
 * scope, registers itself in that scope's `buffers` set, and accumulates further events into the
 * frame. The owning {@link withBufferedTreeEvents} call drives flush/merge/discard via
 * {@link KernelEventBuffer.endScope}, walking only the buffers it touched.
 */
class KernelEventBuffer implements Listenable<KernelEvents> {
	#disposed: boolean = false;

	/**
	 * Stack of buffer frames, one per active {@link withBufferedTreeEvents} scope that this buffer
	 * has received at least one event in. The top frame is the live state for the most-recent such
	 * scope. Scopes in which this buffer never saw an event do not appear here at all.
	 *
	 * @remarks
	 * The Nth frame on this stack corresponds to the Nth entry (from the bottom) of
	 * {@link scopeStack} for which this buffer was added to the scope's `buffers` set. Because
	 * inner scopes can only be touched after outer ones, the relative ordering of frames here
	 * always matches the relative ordering of the scopes they belong to in {@link scopeStack}.
	 */
	readonly #bufferStack: BufferFrame[] = [];

	readonly #events = createEmitter<KernelEvents>();

	#eventSource: Listenable<KernelEvents> & HasListeners<KernelEvents>;
	readonly #disposeSourceListeners: Map<keyof KernelEvents, Off> = new Map();

	public constructor(
		/**
		 * Source of the kernel events.
		 * Subscriptions will be created on-demand when listeners are added to this.events,
		 * and those subscriptions will be cleaned up when all corresponding listeners have been removed.
		 */
		eventSource: Listenable<KernelEvents> & HasListeners<KernelEvents>,
	) {
		this.#eventSource = eventSource;
	}

	/**
	 * Migrate this event buffer to a new event source.
	 *
	 * @remarks
	 * Cleans up any existing event subscriptions from the old source.
	 * Binds events to the new source for each event with active listeners.
	 */
	public migrateEventSource(
		newSource: Listenable<KernelEvents> & HasListeners<KernelEvents>,
	): void {
		// Unsubscribe from the old source
		for (const off of this.#disposeSourceListeners.values()) {
			off();
		}
		this.#disposeSourceListeners.clear();

		this.#eventSource = newSource;

		if (this.#events.hasListeners("childrenChangedAfterBatch")) {
			const off = this.#eventSource.on(
				"childrenChangedAfterBatch",
				({ changedFields, fieldMarks }) =>
					this.#emit("childrenChangedAfterBatch", { changedFields, fieldMarks }),
			);
			this.#disposeSourceListeners.set("childrenChangedAfterBatch", off);
		}
		if (this.#events.hasListeners("subtreeChangedAfterBatch")) {
			const off = this.#eventSource.on("subtreeChangedAfterBatch", () =>
				this.#emit("subtreeChangedAfterBatch"),
			);
			this.#disposeSourceListeners.set("subtreeChangedAfterBatch", off);
		}
	}

	public on(eventName: keyof KernelEvents, listener: KernelEvents[typeof eventName]): Off {
		this.#assertNotDisposed();

		// Lazily bind event listeners to the source.
		// If we do not have any existing listeners for this event, then we need to bind to the source.
		if (!this.#events.hasListeners(eventName)) {
			assert(
				!this.#disposeSourceListeners.has(eventName),
				0xc4f /* Should not have a dispose function without listeners */,
			);

			const off: Off =
				eventName === "childrenChangedAfterBatch"
					? this.#eventSource.on(eventName, (args) => this.#emit(eventName, args))
					: this.#eventSource.on(eventName, () => this.#emit(eventName));
			this.#disposeSourceListeners.set(eventName, off);
		}

		this.#events.on(eventName, listener);
		// Return a bound method instead of an arrow closure. A bound function captures
		// (target, thisArg, ...boundArgs) in a fixed shape that V8 can optimize more
		// uniformly than a closure that captures its lexical context.
		return this.off.bind(this, eventName, listener);
	}

	public off(eventName: keyof KernelEvents, listener: KernelEvents[typeof eventName]): void {
		this.#events.off(eventName, listener);

		// If there are no remaining listeners for the event, unbind from the source
		if (!this.#events.hasListeners(eventName)) {
			const off = this.#disposeSourceListeners.get(eventName);
			off?.();
			this.#disposeSourceListeners.delete(eventName);
		}
	}

	#emit(
		eventName: keyof KernelEvents,
		arg?: {
			changedFields: ReadonlySet<FieldKey>;
			fieldMarks: ReadonlyMap<FieldKey, readonly DeltaMark[]>;
		},
	): void {
		this.#assertNotDisposed();
		switch (eventName) {
			case "childrenChangedAfterBatch": {
				assert(arg !== undefined, 0xcea /* childrenChangedAfterBatch requires arg */);
				return this.#handleChildrenChangedAfterBatch(arg.changedFields, arg.fieldMarks);
			}
			case "subtreeChangedAfterBatch": {
				return this.#handleSubtreeChangedAfterBatch();
			}
			default: {
				unreachableCase(eventName);
			}
		}
	}

	/**
	 * Get the frame this buffer should write to for the current scope, allocating one (and
	 * registering this buffer in the current scope) if needed. Returns `undefined` when no
	 * scope is active, signalling the caller to emit immediately.
	 *
	 * @remarks
	 * Each call also moves this buffer to the **end** of the current scope's `buffers` set,
	 * producing last-touch iteration order at flush time. The underlying anchor set always
	 * fires descendant events before ancestor events within each batch, so an ancestor's
	 * buffer is touched after all of its descendants' buffers in every batch — and last-touch
	 * ordering therefore yields descendant-before-ancestor emission order.
	 */
	#frameForCurrentScope(): BufferFrame | undefined {
		if (scopeStack.length === 0) {
			return undefined;
		}
		// eslint-disable-next-line unicorn/prefer-at -- Array.at requires ES2022.
		const currentScope = scopeStack[scopeStack.length - 1] ?? fail("missing current scope");
		if (currentScope.buffers.has(this)) {
			// Move to end of iteration order so the buffer's emission position reflects the
			// most recent batch that touched it.
			currentScope.buffers.delete(this);
			currentScope.buffers.add(this);
		} else {
			currentScope.buffers.add(this);
			this.#bufferStack.push(createEmptyBufferFrame());
		}
		// eslint-disable-next-line unicorn/prefer-at -- Array.at requires ES2022.
		return this.#bufferStack[this.#bufferStack.length - 1] ?? fail("missing top frame");
	}

	#handleChildrenChangedAfterBatch(
		changedFields: ReadonlySet<FieldKey>,
		fieldMarks: ReadonlyMap<FieldKey, readonly DeltaMark[]>,
	): void {
		const frame = this.#frameForCurrentScope();
		if (frame === undefined) {
			// If there is no active buffer frame, then we are not currently buffering events and should emit them immediately.,
			this.#events.emit("childrenChangedAfterBatch", { changedFields, fieldMarks });
			return;
		}
		for (const fieldKey of changedFields) {
			frame.childrenChangedBuffer.add(fieldKey);
		}
		for (const [key, marks] of fieldMarks) {
			if (frame.invalidatedFieldMarkKeys.has(key)) {
				// Already permanently invalidated by an earlier collision; ignore this batch too.
				// TODO: Once the eventing stack is rewritten to walk the composed delta at flush
				// time, this collision path will be unreachable and can be removed entirely.
				continue;
			}
			if (frame.fieldMarksBuffer.has(key)) {
				// A second batch of marks arrived for the same field before the buffer was flushed.
				// We have no delta composition logic, so permanently invalidate this field so that
				// any further batches are also discarded rather than incorrectly surfaced.
				frame.fieldMarksBuffer.delete(key);
				frame.invalidatedFieldMarkKeys.add(key);
			} else {
				frame.fieldMarksBuffer.set(key, marks);
			}
		}
	}

	#handleSubtreeChangedAfterBatch(): void {
		const frame = this.#frameForCurrentScope();
		if (frame === undefined) {
			this.#events.emit("subtreeChangedAfterBatch");
			return;
		}
		frame.subTreeChangedBuffer = true;
	}

	/**
	 * End the buffering scope this buffer most recently participated in.
	 *
	 * @param discardBufferedEvents - If true, drop the top frame entirely. If false, the top
	 * frame's events either merge into the parent scope or are emitted to listeners.
	 * @param parent - The scope (now top of {@link scopeStack}) that surrounded the just-ended
	 * scope, or `undefined` if the just-ended scope was the outermost one.
	 *
	 * @remarks
	 * Only called by {@link withBufferedTreeEvents}, and only for buffers it observed in the
	 * scope's `buffers` set — so the top of this buffer's stack is guaranteed to belong to the
	 * scope that just ended.
	 *
	 * Two cases when `!discardBufferedEvents`:
	 *
	 * - **Nested** (`parent` defined): merge the popped frame into the parent scope's frame for this buffer (allocating that frame on demand if the parent never touched this buffer), using the same collision rules as the buffer's children-changed handler.
	 * - **Outermost** (`parent === undefined`): emit the accumulated events to listeners.
	 */
	public endScope(discardBufferedEvents: boolean, parent: Scope | undefined): void {
		this.#assertNotDisposed();
		const top =
			this.#bufferStack.pop() ?? fail("Expected non-empty buffer stack in endScope.");
		if (discardBufferedEvents) {
			return;
		}
		if (parent === undefined) {
			// Outermost pop: emit accumulated events.
			if (top.childrenChangedBuffer.size > 0) {
				this.#events.emit("childrenChangedAfterBatch", {
					changedFields: top.childrenChangedBuffer,
					fieldMarks: top.fieldMarksBuffer,
				});
			}
			if (top.subTreeChangedBuffer) {
				this.#events.emit("subtreeChangedAfterBatch");
			}
		} else {
			// Nested: bubble the inner scope's events up into the parent scope's frame.
			// Bump this buffer to the end of the parent scope's iteration order to preserve
			// last-touch semantics (see Scope.buffers docs).
			if (parent.buffers.has(this)) {
				parent.buffers.delete(this);
				parent.buffers.add(this);
			} else {
				parent.buffers.add(this);
				this.#bufferStack.push(createEmptyBufferFrame());
			}
			// eslint-disable-next-line unicorn/prefer-at -- Array.at requires ES2022.
			const parentFrame =
				this.#bufferStack[this.#bufferStack.length - 1] ?? fail("missing parent frame");
			mergeBufferFrameInto(parentFrame, top);
		}
	}

	#assertNotDisposed(): void {
		assert(!this.#disposed, 0xc51 /* Event handler disposed. */);
	}

	public dispose(): void {
		if (this.#disposed) {
			return;
		}

		assert(
			this.#bufferStack.length === 0,
			0xc52 /* Buffered kernel events should have been flushed before disposing. */,
		);

		for (const off of this.#disposeSourceListeners.values()) {
			off();
		}
		this.#disposeSourceListeners.clear();

		this.#disposed = true;
	}
}

// #endregion

/**
 * For hydrated nodes this is a HydratedFlexTreeNode thats a projection of forest content.
 * For {@link Unhydrated} nodes this is a UnhydratedFlexTreeNode.
 */
export type InnerNode = FlexTreeNode;

/**
 * Narrows innerNode to either {@link UnhydratedFlexTreeNode} or {@link HydratedFlexTreeNode}.
 */
export function splitInnerNodeType(
	innerNode: InnerNode,
): asserts innerNode is UnhydratedFlexTreeNode | HydratedFlexTreeNode {
	assert(
		innerNode instanceof UnhydratedFlexTreeNode || innerNode.isHydrated(),
		0xbc8 /* Invalid inner node type */,
	);
}

/**
 * An anchor slot which associates an anchor with its corresponding {@link TreeNode}, if there is one.
 * @remarks
 * For this to work, we have to require that there is at most a single view using a given AnchorSet.
 * FlexTree already has this assumption, and we also assume there is a single simple-tree per FlexTree, so this is valid.
 */
export const simpleTreeNodeSlot = anchorSlot<TreeNode>();

/**
 * Dispose a TreeNode (if any) for an existing anchor without disposing the anchor.
 */
export function tryDisposeTreeNode(anchorNode: AnchorNode): void {
	const treeNode = anchorNode.slots.get(simpleTreeNodeSlot);
	if (treeNode !== undefined) {
		const kernel = getKernel(treeNode);
		kernel.dispose();
		anchorNode.slots.delete(simpleTreeNodeSlot);
	}
}

/**
 * Gets the {@link TreeNodeSchema} for the {@link InnerNode}.
 */
export function getSimpleNodeSchemaFromInnerNode(innerNode: InnerNode): TreeNodeSchema {
	const context: Context = getSimpleContextFromInnerNode(innerNode);
	return context.schema.get(innerNode.type) ?? fail(0xb3f /* missing schema from context */);
}

/**
 * Gets the {@link Context} for the {@link InnerNode}.
 */
export function getSimpleContextFromInnerNode(innerNode: InnerNode): Context {
	splitInnerNodeType(innerNode);
	if (innerNode instanceof UnhydratedFlexTreeNode) {
		return innerNode.simpleContext;
	}

	const context = innerNode.anchorNode.anchorSet.slots.get(SimpleContextSlot);
	assert(context !== undefined, 0xa55 /* missing simple tree context */);

	return context;
}

/**
 * Retrieves the flex node associated with the given target.
 * @remarks
 * For {@link Unhydrated} nodes, this returns the MapTreeNode.
 *
 * For hydrated nodes it returns a FlexTreeNode backed by the forest.
 *
 * @throws A {@link @fluidframework/telemetry-utils#UsageError} if the node has been deleted.
 */
export function getInnerNode(treeNode: TreeNode): InnerNode {
	const kernel = getKernel(treeNode);
	return kernel.getInnerNode();
}

/**
 * Gets a flex node from an anchor node
 */
function flexNodeFromAnchor(anchorNode: AnchorNode): HydratedFlexTreeNode {
	const flexNode = anchorNode.slots.get(flexTreeSlot);
	if (flexNode !== undefined) {
		return flexNode; // If it does have a flex node, return it...
	} // ...otherwise, the flex node must be created
	const context =
		anchorNode.anchorSet.slots.get(ContextSlot) ?? fail(0xb45 /* missing context */);
	const cursor = context.checkout.forest.allocateCursor("getFlexNode");
	context.checkout.forest.moveCursorToPath(anchorNode, cursor);
	const newFlexNode = getOrCreateHydratedFlexTreeNode(context, cursor);
	cursor.free();
	return newFlexNode;
}

/**
 * Gets a tree node from an anchor node
 */
export function treeNodeFromAnchor(anchorNode: AnchorNode): TreeNode | TreeValue {
	const cached = anchorNode.slots.get(simpleTreeNodeSlot);
	if (cached !== undefined) {
		return cached;
	}

	const flexNode = flexNodeFromAnchor(anchorNode);
	return createTreeNodeFromInner(flexNode);
}

/**
 * Constructs a TreeNode from an InnerNode.
 * @remarks
 * This does not do caching or validation: caller must ensure duplicate nodes for a given inner node are not created, and that the inner node is valid.
 */
export function createTreeNodeFromInner(innerNode: InnerNode): TreeNode | TreeValue {
	const classSchema = getSimpleNodeSchemaFromInnerNode(innerNode);
	const internal = innerNode as unknown as InternalTreeNode;
	return typeof classSchema === "function"
		? new classSchema(internal)
		: (classSchema as { create(data: InternalTreeNode): TreeNode | TreeValue }).create(
				internal,
			);
}

/**
 * Creating multiple simple tree contexts for the same branch, and thus with the same underlying AnchorSet does not work due to how TreeNode caching works.
 * This slot is used to detect if one already exists and error if creating a second.
 * @remarks
 * See also {@link ContextSlot} in which the flex-tree context is stored.
 */
export const SimpleContextSlot = anchorSlot<HydratedContext>();
