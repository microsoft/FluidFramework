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
	private disposeRequested = false;

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
	 * Supports event buffering via {@link withBufferedTreeEvents}.
	 *
	 * Allocated lazily on first access to {@link TreeNodeKernel.events}.
	 * We expect the majority of nodes to never have event listeners registered, so
	 * deferring construction avoids per-kernel allocations.
	 */
	#eventBuffer: KernelEventBuffer | undefined;

	/**
	 * The last status reported through {@link TreeNodeKernel.events}.
	 * @remarks
	 * Compared with the status at the end of each batch to detect transitions. When tree events are
	 * buffered, the event buffer combines transitions while this value continues to track the latest
	 * observed status.
	 */
	#lastReportedStatus: TreeStatus;

	/**
	 * Subscription to the checkout's `afterBatch` event used to detect status transitions at batch
	 * boundaries. Present only while there is at least one `statusChanged` listener and the node is
	 * hydrated.
	 */
	#afterBatchWatcherOff: Off | undefined;

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

			this.#lastReportedStatus = TreeStatus.New;
		} else {
			// Hydrated case
			this.#hydrationState = this.createHydratedState(innerNode);
			// For hydrated nodes created directly, compute initial status
			this.#lastReportedStatus = this.getStatus();
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

		if (this.#eventBuffer?.hasListeners("statusChanged") === true) {
			this.#startAfterBatchWatcher();
			// Surface the New -> InDocument transition to listeners. If hydration happens
			// mid-batch (e.g. `insertAtEnd`), the watcher's `afterBatch` will deliver it once the tree is
			// consistent. If the tree is already settled (e.g. hydration via `view.initialize()`), no
			// trailing `afterBatch` follows, so deliver synchronously here — using the known `InDocument`
			// status rather than `getStatus()`, which would pollute `treeStatusFromAnchorCache` mid-hydration.
			const flexContext = this.context.flexContext;
			assert(flexContext.isHydrated(), "hydrated node must have a hydrated context");
			if (!flexContext.checkout.isBatchInProgress) {
				this.#checkAndEmitStatusChange(TreeStatus.InDocument);
			}
		}
	}

	/**
	 * Emits a status change if `newStatus` differs from the last status reported to listeners.
	 */
	#checkAndEmitStatusChange(newStatus: TreeStatus = this.getStatus()): void {
		const oldStatus = this.#lastReportedStatus;
		if (oldStatus !== newStatus) {
			this.#lastReportedStatus = newStatus;
			this.#eventBuffer?.emitStatusChanged({ oldStatus, newStatus });
		}
	}

	/**
	 * Starts or stops status observation when the first listener is added or the last is removed.
	 */
	#onStatusListenerPresenceChanged(hasListeners: boolean): void {
		if (hasListeners) {
			if (this.isHydrated()) {
				const flexContext = this.context.flexContext;
				assert(flexContext.isHydrated(), "hydrated node must have a hydrated context");
				if (flexContext.checkout.isBatchInProgress) {
					this.#startAfterBatchWatcher(true);
				} else {
					this.#lastReportedStatus = this.getStatus();
					this.#startAfterBatchWatcher();
				}
			} else {
				this.#lastReportedStatus = TreeStatus.New;
			}
		} else {
			this.#releaseAfterBatchWatcher();
		}
	}

	/**
	 * Subscribes to the checkout's `afterBatch` event so status transitions are surfaced via
	 * `statusChanged` once the tree (and thus `getStatus()`) is consistent.
	 * @remarks
	 * Must only be called when hydrated. Reading status is deferred to the event callback so this is safe
	 * to call during {@link TreeNodeKernel.hydrate}.
	 */
	#startAfterBatchWatcher(baselineAtNextBatch: boolean = false): void {
		if (this.#afterBatchWatcherOff !== undefined) {
			return;
		}
		const flexContext = this.context.flexContext;
		assert(flexContext.isHydrated(), "afterBatch status watcher requires a hydrated context");
		const checkout = flexContext.checkout;
		let shouldBaselineAtNextBatch = baselineAtNextBatch;
		this.#afterBatchWatcherOff = checkout.events.on("afterBatch", () => {
			if (shouldBaselineAtNextBatch) {
				shouldBaselineAtNextBatch = false;
				this.#lastReportedStatus = this.getStatus();
			} else {
				this.#checkAndEmitStatusChange();
			}
		});
	}

	/**
	 * Tears down the `afterBatch` status watcher once the last status listener has been removed.
	 */
	#releaseAfterBatchWatcher(): void {
		this.#afterBatchWatcherOff?.();
		this.#afterBatchWatcherOff = undefined;
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
		assert(!this.disposeRequested, "Cannot register events on a disposed node");
		// Allocate the buffer on first access. See {@link TreeNodeKernel.#eventBuffer} for rationale.
		if (this.#eventBuffer === undefined) {
			const eventSource = isHydrated(this.#hydrationState)
				? this.#hydrationState.innerNode.anchorNode.events
				: this.#hydrationState.innerNode.events;
			this.#eventBuffer = new KernelEventBuffer(
				eventSource,
				this.#onStatusListenerPresenceChanged.bind(this),
				(oldStatus) => {
					this.#lastReportedStatus = oldStatus;
				},
			);
		}
		return this.#eventBuffer;
	}

	public dispose(): void {
		debugAssert(() => !this.disposeRequested || "Cannot dispose a disposed node");
		if (this.disposeRequested) {
			return;
		}
		this.disposeRequested = true;

		// Emit the terminal status change before completing disposal.
		// This ordering matters: listeners receiving this event may still need to call
		// methods on the kernel (e.g., `getStatus()`, `getInnerNode()`) which throw
		// once `disposed` is true. When events are buffered, disposal is completed after
		// the buffered event is delivered.
		this.#checkAndEmitStatusChange(TreeStatus.Deleted);
		this.#releaseAfterBatchWatcher();

		if (this.#eventBuffer === undefined) {
			this.#finishDispose();
		} else {
			this.#eventBuffer.dispose(this.#finishDispose.bind(this));
		}
	}

	#finishDispose(): void {
		this.disposed = true;
		if (isHydrated(this.#hydrationState)) {
			for (const off of this.#hydrationState.offAnchorNode) {
				off();
			}
		}
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

type KernelContentEvents = Pick<AnchorEvents, (typeof kernelEvents)[number]>;

/**
 * Event data for status change events.
 */
export interface StatusChangedEventData {
	/**
	 * The status before the change.
	 */
	readonly oldStatus: TreeStatus;
	/**
	 * The status after the change.
	 */
	readonly newStatus: TreeStatus;
}

/**
 * Events surfaced through {@link TreeNodeKernel.events}.
 */
interface KernelEvents extends KernelContentEvents {
	/**
	 * Emitted after the batch in which the node's {@link TreeStatus} changed has settled.
	 * @remarks
	 * Buffered and coalesced with content events when inside a {@link withBufferedTreeEvents} window.
	 * `oldStatus` and `newStatus` may be equal when one or more intermediate transitions occurred during
	 * that window. This preserves location invalidation when a node leaves and returns with the same
	 * status.
	 */
	statusChanged(data: StatusChangedEventData): void;
}

// #region TreeNodeEventBuffer

/**
 * Whether or not events from {@link TreeNodeKernel} should be buffered instead of emitted immediately.
 */
let bufferTreeEvents: boolean = false;

/**
 * Call the provided callback with {@link TreeNode}s' events paused until after the callback's completion.
 *
 * Events that would otherwise have been emitted immediately are merged and buffered until after the
 * provided callback has been completed.
 *
 * @remarks
 * Note: this should be used with caution. User application behaviors are implicitly coupled to event timing.
 * Disrupting this timing can lead to unexpected behavior.
 */
export function withBufferedTreeEvents(callback: () => void): void {
	if (bufferTreeEvents) {
		// Already buffering - just run the callback
		callback();
	} else {
		bufferTreeEvents = true;
		const buffersToFlush: TreeEventBuffer[] = [];
		let callbackError: unknown;
		let callbackThrew = false;
		try {
			callback();
		} catch (error) {
			callbackError = error;
			callbackThrew = true;
		} finally {
			bufferTreeEvents = false;
			// Snapshot-and-clear before flushing to safely handle reentrant `withBufferedTreeEvents`
			// calls made by listeners that fire during the flush below:
			// - Iterating an array means a reentrant call's `clear()` cannot truncate our loop
			//   and cause entries later in the set to be skipped (and their events dropped).
			// - Clearing up front means the reentrant call starts from an empty set, so its own
			//   finally block only flushes what it buffered - not a re-flush of our remaining entries.
			buffersToFlush.push(...activeBuffers);
			activeBuffers.clear();
		}

		if (callbackThrew) {
			for (const buffer of buffersToFlush) {
				buffer.discard();
			}
			throw callbackError;
		}

		let flushError: unknown;
		let flushThrew = false;
		for (const flush of [
			(buffer: TreeEventBuffer): void => buffer.flushContent(),
			(buffer: TreeEventBuffer): void => buffer.flushDerived(),
		]) {
			for (const buffer of buffersToFlush) {
				try {
					flush(buffer);
				} catch (error) {
					if (!flushThrew) {
						flushError = error;
						flushThrew = true;
					}
				}
			}
		}
		if (flushThrew) {
			throw flushError;
		}
	}
}

/**
 * An event source which participates in {@link withBufferedTreeEvents}.
 */
interface TreeEventBuffer {
	flushContent(): void;
	flushDerived(): void;
	discard(): void;
}

/**
 * A coalescing no-argument tree event which shares the kernel event buffering lifecycle.
 *
 * @remarks
 * This encapsulates the temporary global buffering mechanism so consumers do not need to inspect or
 * coordinate its state.
 */
export class BufferedTreeEvent implements TreeEventBuffer {
	#pending = false;
	#active = true;

	public constructor(private readonly listener: () => void) {}

	public emit(): void {
		if (!this.#active) {
			return;
		}
		if (bufferTreeEvents) {
			this.#pending = true;
			activeBuffers.add(this);
		} else {
			this.listener();
		}
	}

	public flushContent(): void {}

	public flushDerived(): void {
		if (this.#active && this.#pending) {
			this.#pending = false;
			this.listener();
		}
	}

	public discard(): void {
		this.#pending = false;
	}

	public dispose(): void {
		this.#active = false;
		this.#pending = false;
		activeBuffers.delete(this);
	}
}

/**
 * Set of {@link KernelEventBuffer}s that have accumulated buffered events during the current
 * {@link withBufferedTreeEvents} window and therefore need to be flushed when it ends.
 *
 * @remarks
 * The set should be empty whenever no buffering window is in progress.
 */
const activeBuffers: Set<TreeEventBuffer> = new Set();

/**
 * Test-only accessor for the current size of {@link activeBuffers}.
 * @remarks Only exported for testing purposes. Not intended for any other use.
 */
export function TEST_activeBufferCount(): number {
	return activeBuffers.size;
}

/**
 * Event emitter for {@link TreeNodeKernel}, which optionally buffers events based on {@link bufferTreeEvents}.
 * @remarks When buffering is active, this adds itself to {@link activeBuffers} so that
 * {@link withBufferedTreeEvents} can flush it at the end of the buffering window.
 */
class KernelEventBuffer implements Listenable<KernelEvents> {
	#disposed: boolean = false;
	#flushPending: boolean = false;
	#disposeAfterFlush: (() => void) | undefined;

	readonly #events = createEmitter<KernelEvents>();

	#eventSource: Listenable<KernelContentEvents> & HasListeners<KernelContentEvents>;
	readonly #disposeSourceListeners: Map<keyof KernelContentEvents, Off> = new Map();

	/**
	 * Buffer of fields that have changed since events were paused.
	 * When events are flushed, a single {@link AnchorEvents.childrenChangedAfterBatch} event will be emitted
	 * containing the accumulated set of changed fields.
	 */
	readonly #childrenChangedBuffer: Set<FieldKey> = new Set();

	/**
	 * Buffer of field marks accumulated since events were paused.
	 * Emitted alongside the buffered changed-fields set when flushed.
	 */
	readonly #fieldMarksBuffer: Map<FieldKey, readonly DeltaMark[]> = new Map();

	/**
	 * Fields whose marks have been permanently invalidated within the current buffer window due to
	 * two or more separate delta batches touching the same field.
	 * Once a key is in this set it must never be re-added to the marks buffer, even if
	 * a third (or later) batch arrives for that field.
	 */
	readonly #invalidatedFieldMarkKeys: Set<FieldKey> = new Set();

	/**
	 * Whether or not the subtree has changed since events were paused.
	 * When events are flushed, a single {@link AnchorEvents.subTreeChanged} event will be emitted if and only
	 * if the subtree has changed.
	 */
	#subTreeChangedBuffer: boolean = false;

	/**
	 * Status transition accumulated while events are paused.
	 * @remarks
	 * The first old status and latest new status are retained so intermediate transitions are hidden.
	 */
	#statusChangedBuffer: StatusChangedEventData | undefined;
	#statusAtBufferStart: TreeStatus | undefined;

	public constructor(
		/**
		 * Source of the kernel events.
		 * Subscriptions will be created on-demand when listeners are added to this.events,
		 * and those subscriptions will be cleaned up when all corresponding listeners have been removed.
		 */
		eventSource: Listenable<KernelContentEvents> & HasListeners<KernelContentEvents>,
		private readonly onStatusListenerPresenceChanged: (hasListeners: boolean) => void,
		private readonly onStatusDiscarded: (oldStatus: TreeStatus) => void,
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
		newSource: Listenable<KernelContentEvents> & HasListeners<KernelContentEvents>,
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
					this.#emitContent("childrenChangedAfterBatch", { changedFields, fieldMarks }),
			);
			this.#disposeSourceListeners.set("childrenChangedAfterBatch", off);
		}
		if (this.#events.hasListeners("subtreeChangedAfterBatch")) {
			const off = this.#eventSource.on("subtreeChangedAfterBatch", () =>
				this.#emitContent("subtreeChangedAfterBatch"),
			);
			this.#disposeSourceListeners.set("subtreeChangedAfterBatch", off);
		}
	}

	public on<K extends keyof KernelEvents>(eventName: K, listener: KernelEvents[K]): Off {
		this.#assertNotDisposed();

		if (eventName === "statusChanged") {
			const hadListeners = this.#events.hasListeners(eventName);
			this.#events.on(eventName, listener);
			if (!hadListeners) {
				this.onStatusListenerPresenceChanged(true);
			}
			return this.off.bind(this, eventName, listener);
		}

		// Lazily bind event listeners to the source.
		// If we do not have any existing listeners for this event, then we need to bind to the source.
		if (!this.#events.hasListeners(eventName)) {
			assert(
				!this.#disposeSourceListeners.has(eventName),
				0xc4f /* Should not have a dispose function without listeners */,
			);

			const contentEventName: keyof KernelContentEvents = eventName;
			const off: Off =
				eventName === "childrenChangedAfterBatch"
					? this.#eventSource.on(eventName, (args) => this.#emitContent(eventName, args))
					: this.#eventSource.on(eventName, () => this.#emitContent(eventName));
			this.#disposeSourceListeners.set(contentEventName, off);
		}

		this.#events.on(eventName, listener);
		// Return a bound method instead of an arrow closure. A bound function captures
		// (target, thisArg, ...boundArgs) in a fixed shape that V8 can optimize more
		// uniformly than a closure that captures its lexical context.
		return this.off.bind(this, eventName, listener);
	}

	public off<K extends keyof KernelEvents>(eventName: K, listener: KernelEvents[K]): void {
		this.#events.off(eventName, listener);

		if (eventName === "statusChanged") {
			if (!this.#events.hasListeners(eventName)) {
				this.onStatusListenerPresenceChanged(false);
			}
			return;
		}

		// If there are no remaining listeners for the event, unbind from the source
		if (!this.#events.hasListeners(eventName)) {
			const contentEventName: keyof KernelContentEvents = eventName;
			const off = this.#disposeSourceListeners.get(contentEventName);
			off?.();
			this.#disposeSourceListeners.delete(contentEventName);
		}
	}

	public hasListeners(eventName: keyof KernelEvents): boolean {
		return this.#events.hasListeners(eventName);
	}

	#emitContent(
		eventName: keyof KernelContentEvents,
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

	#handleChildrenChangedAfterBatch(
		changedFields: ReadonlySet<FieldKey>,
		fieldMarks: ReadonlyMap<FieldKey, readonly DeltaMark[]>,
	): void {
		if (bufferTreeEvents) {
			this.#flushPending = true;
			activeBuffers.add(this);
			for (const fieldKey of changedFields) {
				this.#childrenChangedBuffer.add(fieldKey);
			}
			for (const [key, marks] of fieldMarks) {
				if (this.#invalidatedFieldMarkKeys.has(key)) {
					// Already permanently invalidated by an earlier collision; ignore this batch too.
					// TODO: Once the eventing stack is rewritten to walk the composed delta at flush
					// time, this collision path will be unreachable and can be removed entirely.
					continue;
				}
				if (this.#fieldMarksBuffer.has(key)) {
					// A second batch of marks arrived for the same field before the buffer was flushed.
					// We have no delta composition logic, so permanently invalidate this field so that
					// any further batches are also discarded rather than incorrectly surfaced.
					this.#fieldMarksBuffer.delete(key);
					this.#invalidatedFieldMarkKeys.add(key);
				} else {
					this.#fieldMarksBuffer.set(key, marks);
				}
			}
		} else {
			this.#events.emit("childrenChangedAfterBatch", { changedFields, fieldMarks });
		}
	}

	#handleSubtreeChangedAfterBatch(): void {
		if (bufferTreeEvents) {
			this.#flushPending = true;
			activeBuffers.add(this);
			this.#subTreeChangedBuffer = true;
		} else {
			this.#events.emit("subtreeChangedAfterBatch");
		}
	}

	public emitStatusChanged(data: StatusChangedEventData): void {
		this.#assertNotDisposed();
		if (!this.#events.hasListeners("statusChanged")) {
			return;
		}
		if (bufferTreeEvents || this.#flushPending) {
			if (bufferTreeEvents) {
				activeBuffers.add(this);
			}
			this.#flushPending = true;
			const oldStatus = this.#statusChangedBuffer?.oldStatus ?? data.oldStatus;
			this.#statusAtBufferStart ??= oldStatus;
			this.#statusChangedBuffer = { oldStatus, newStatus: data.newStatus };
		} else {
			this.#events.emit("statusChanged", data);
		}
	}

	/**
	 * Flushes any events buffered due to {@link withBufferedTreeEvents}.
	 */
	public flushContent(): void {
		this.#assertNotDisposed();

		const childrenChanged =
			this.#childrenChangedBuffer.size === 0
				? undefined
				: {
						changedFields: new Set(this.#childrenChangedBuffer),
						fieldMarks: new Map(this.#fieldMarksBuffer),
					};
		const subtreeChanged = this.#subTreeChangedBuffer;
		this.#childrenChangedBuffer.clear();
		this.#fieldMarksBuffer.clear();
		this.#invalidatedFieldMarkKeys.clear();
		this.#subTreeChangedBuffer = false;

		let emitError: unknown;
		let emitThrew = false;
		const emit = (callback: () => void): void => {
			try {
				callback();
			} catch (error) {
				if (!emitThrew) {
					emitError = error;
					emitThrew = true;
				}
			}
		};

		if (childrenChanged !== undefined) {
			emit(() => this.#events.emit("childrenChangedAfterBatch", childrenChanged));
		}
		if (subtreeChanged) {
			emit(() => this.#events.emit("subtreeChangedAfterBatch"));
		}
		if (emitThrew) {
			throw emitError;
		}
	}

	public flushDerived(): void {
		this.#assertNotDisposed();
		const statusChanged = this.#statusChangedBuffer;
		this.#statusChangedBuffer = undefined;
		this.#statusAtBufferStart = undefined;
		this.#flushPending = false;
		try {
			if (statusChanged !== undefined) {
				this.#events.emit("statusChanged", statusChanged);
			}
		} finally {
			if (this.#disposeAfterFlush !== undefined) {
				this.#finishDispose();
			}
		}
	}

	public discard(): void {
		const statusAtBufferStart = this.#statusAtBufferStart;
		this.#clearBufferedEvents();
		this.#flushPending = false;
		if (statusAtBufferStart !== undefined) {
			this.onStatusDiscarded(statusAtBufferStart);
		}
		if (this.#disposeAfterFlush !== undefined) {
			this.#finishDispose();
		}
	}

	#clearBufferedEvents(): void {
		this.#childrenChangedBuffer.clear();
		this.#fieldMarksBuffer.clear();
		this.#invalidatedFieldMarkKeys.clear();
		this.#subTreeChangedBuffer = false;
		this.#statusChangedBuffer = undefined;
		this.#statusAtBufferStart = undefined;
	}

	#assertNotDisposed(): void {
		assert(!this.#disposed, 0xc51 /* Event handler disposed. */);
	}

	public dispose(afterDispose: () => void): void {
		if (this.#disposed) {
			afterDispose();
			return;
		}

		if (this.#flushPending) {
			this.#disposeAfterFlush = afterDispose;
			for (const off of this.#disposeSourceListeners.values()) {
				off();
			}
			this.#disposeSourceListeners.clear();
			return;
		}

		this.#finishDispose();
		afterDispose();
	}

	#finishDispose(): void {
		debugAssert(
			() =>
				(this.#childrenChangedBuffer.size === 0 &&
					!this.#subTreeChangedBuffer &&
					this.#statusChangedBuffer === undefined) ||
				"Buffered kernel events should have been flushed before disposing.",
		);
		debugAssert(
			() => !activeBuffers.has(this) || "Disposed buffer should not be in activeBuffers.",
		);

		for (const off of this.#disposeSourceListeners.values()) {
			off();
		}
		this.#disposeSourceListeners.clear();

		this.#clearBufferedEvents();
		this.#flushPending = false;

		this.#disposed = true;
		const afterDispose = this.#disposeAfterFlush;
		this.#disposeAfterFlush = undefined;
		afterDispose?.();
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
