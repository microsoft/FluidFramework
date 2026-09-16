/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { createEmitter } from "@fluid-internal/client-utils";
import type { Listenable, Off } from "@fluidframework/core-interfaces/internal";
import { assert, unreachableCase } from "@fluidframework/core-utils/internal";

import { type DetachedField, keyAsDetachedField } from "../core/index.js";
import { TreeStatus } from "../feature-libraries/index.js";
import {
	bufferTreeEvent,
	getKernel,
	type ImplicitFieldSchema,
	isTreeNode,
	onTreeNodeHydrated,
	removeTreeEventBuffer,
	type TreeChangeEventsBeta,
	type TreeEventBuffer,
	type TreeLeafValue,
	type TreeNode,
	treeNodeApi,
} from "../simple-tree/index.js";

import type { SchematizingSimpleTreeView } from "./schematizingTreeView.js";

type ParentEvents = Pick<TreeChangeEventsBeta, "nodeChanged" | "treeChanged">;

type ParentLocation =
	| {
			readonly type: "document";
			readonly branch: SchematizingSimpleTreeView<ImplicitFieldSchema>;
	  }
	| {
			readonly type: "removed";
			readonly node: TreeNode;
			readonly detachedField: DetachedField;
	  }
	| {
			readonly type: "unhydrated";
			readonly node: TreeNode;
	  };

/**
 * Manages events for a parent location.
 *
 * @remarks
 * Parent events describe the final tree state.
 * This class uses {@link TreeEventBuffer} to buffer these events.
 */
export class ParentKernel implements Listenable<ParentEvents>, TreeEventBuffer {
	/** Emits events for this parent location. */
	readonly #events = createEmitter<ParentEvents>();
	/** Tracks node-change listeners so they can be removed when the location is invalidated. */
	readonly #nodeChangedListeners = new Set<ParentEvents["nodeChanged"]>();
	/** Tracks tree-change listeners so they can be removed when the location is invalidated. */
	readonly #treeChangedListeners = new Set<ParentEvents["treeChanged"]>();
	/** Events accumulated during the current buffering window. */
	readonly #pendingEvents = new Set<keyof ParentEvents>();
	/** Stops observing changes to the represented location. */
	#locationObservationOff: Off | undefined;
	/** Stops observing changes within a document root. */
	#treeObservationOff: Off | undefined;
	/** The last document root observed by this kernel. */
	#lastRoot: TreeNode | TreeLeafValue | undefined;
	/** True after a removed or unhydrated location ceases to exist. */
	#invalidated = false;

	/** Creates a kernel for the specified parent location. */
	private constructor(private readonly location: ParentLocation) {}

	/** Creates a kernel for a document root. */
	public static documentRoot(
		branch: SchematizingSimpleTreeView<ImplicitFieldSchema>,
	): ParentKernel {
		return new ParentKernel({ type: "document", branch });
	}

	/** Creates a kernel for a root in a removed field. */
	public static removedRoot(node: TreeNode, detachedField: DetachedField): ParentKernel {
		return new ParentKernel({ type: "removed", node, detachedField });
	}

	/** Creates a kernel for the root of an unhydrated tree. */
	public static unhydratedRoot(node: TreeNode): ParentKernel {
		return new ParentKernel({ type: "unhydrated", node });
	}

	public on<K extends keyof ParentEvents>(eventName: K, listener: ParentEvents[K]): Off {
		if (this.#invalidated && this.location.type !== "document") {
			return () => {};
		}
		const hadAnyListeners = this.#hasAnyListeners();
		const hadEventListeners = this.#events.hasListeners(eventName);
		this.#events.on(eventName, listener);
		this.#trackListener(eventName, listener);

		try {
			if (!hadAnyListeners && !this.#invalidated) {
				this.#startLocationObservation();
			}
			if (
				eventName === "treeChanged" &&
				!hadEventListeners &&
				this.location.type === "document"
			) {
				this.#startTreeObservation();
			}
		} catch (error) {
			this.#events.off(eventName, listener);
			this.#untrackListener(eventName, listener);
			if (!this.#hasAnyListeners()) {
				this.#stopLocationObservation();
			}
			throw new Error("Failed to start parent location observation", { cause: error });
		}

		if (this.#invalidated && this.location.type !== "document") {
			this.#clearInvalidatedLocationListeners();
			return () => {};
		}

		return this.off.bind(this, eventName, listener);
	}

	/** Sends pending parent location events. */
	public flush(): void {
		const pendingEvents = [...this.#pendingEvents];
		this.#pendingEvents.clear();

		try {
			for (const eventName of pendingEvents) {
				this.#emitNow(eventName);
			}
		} finally {
			this.#clearInvalidatedLocationListeners();
		}
	}

	/**
	 * Removes pending parent location events if the buffered callback fails.
	 */
	public discard(): void {
		this.#pendingEvents.clear();
		this.#clearInvalidatedLocationListeners();
	}

	public off<K extends keyof ParentEvents>(eventName: K, listener: ParentEvents[K]): void {
		this.#events.off(eventName, listener);
		this.#untrackListener(eventName, listener);
		if (!this.#events.hasListeners(eventName)) {
			this.#pendingEvents.delete(eventName);
			if (eventName === "treeChanged") {
				this.#stopTreeObservation();
			}
		}

		if (!this.#hasAnyListeners()) {
			this.#stopLocationObservation();
		}
		if (this.#pendingEvents.size === 0) {
			removeTreeEventBuffer(this);
		}
	}

	#hasAnyListeners(): boolean {
		return (
			this.#events.hasListeners("nodeChanged") || this.#events.hasListeners("treeChanged")
		);
	}

	#trackListener<K extends keyof ParentEvents>(eventName: K, listener: ParentEvents[K]): void {
		if (eventName === "nodeChanged") {
			this.#nodeChangedListeners.add(listener as ParentEvents["nodeChanged"]);
		} else {
			this.#treeChangedListeners.add(listener as ParentEvents["treeChanged"]);
		}
	}

	#untrackListener<K extends keyof ParentEvents>(
		eventName: K,
		listener: ParentEvents[K],
	): void {
		if (eventName === "nodeChanged") {
			this.#nodeChangedListeners.delete(listener as ParentEvents["nodeChanged"]);
		} else {
			this.#treeChangedListeners.delete(listener as ParentEvents["treeChanged"]);
		}
	}

	#clearInvalidatedLocationListeners(): void {
		if (!this.#invalidated || this.location.type === "document") {
			return;
		}
		for (const listener of this.#nodeChangedListeners) {
			this.#events.off("nodeChanged", listener);
		}
		for (const listener of this.#treeChangedListeners) {
			this.#events.off("treeChanged", listener);
		}
		this.#nodeChangedListeners.clear();
		this.#treeChangedListeners.clear();
	}

	#startLocationObservation(): void {
		assert(this.#locationObservationOff === undefined, "Location observation already started");
		switch (this.location.type) {
			case "document": {
				this.#startDocumentRootObservation(this.location.branch);
				break;
			}
			case "removed": {
				this.#startRemovedRootObservation(this.location.node, this.location.detachedField);
				break;
			}
			case "unhydrated": {
				this.#startUnhydratedRootObservation(this.location.node);
				break;
			}
			default: {
				unreachableCase(this.location);
			}
		}
	}

	#startDocumentRootObservation(
		branch: SchematizingSimpleTreeView<ImplicitFieldSchema>,
	): void {
		this.#lastRoot = this.#readDocumentRoot(branch);
		this.#locationObservationOff = branch.events.on("rootChanged", () => {
			const newRoot = this.#readDocumentRoot(branch);
			if (newRoot === this.#lastRoot) {
				return;
			}

			this.#lastRoot = newRoot;
			this.#stopTreeObservation();
			try {
				this.#emitLocationChanged();
			} finally {
				this.#startTreeObservation();
			}
		});
	}

	#startRemovedRootObservation(node: TreeNode, detachedField: DetachedField): void {
		const kernel = getKernel(node);
		if (kernel.getStatus() === TreeStatus.Deleted) {
			this.#invalidated = true;
			return;
		}
		const anchorNode = kernel.anchorNode;
		assert(anchorNode !== undefined, "Expected a removed node to be hydrated");

		if (
			anchorNode.parent !== undefined ||
			keyAsDetachedField(anchorNode.parentField) !== detachedField
		) {
			this.#invalidated = true;
			return;
		}

		const flexContext = kernel.context.flexContext;
		assert(flexContext.isHydrated(), "Expected a removed node to have a hydrated context");
		const checkout = flexContext.checkout;
		let destroyed = false;

		const offAfterDestroy = anchorNode.events.on("afterDestroy", () => {
			destroyed = true;
			if (!checkout.isBatchInProgress) {
				this.#invalidateLocation();
			}
		});
		const offAfterBatch = checkout.events.on("afterBatch", () => {
			if (
				destroyed ||
				anchorNode.parent !== undefined ||
				keyAsDetachedField(anchorNode.parentField) !== detachedField
			) {
				this.#invalidateLocation();
			}
		});
		this.#locationObservationOff = () => {
			offAfterDestroy();
			offAfterBatch();
		};
	}

	#startUnhydratedRootObservation(node: TreeNode): void {
		if (getKernel(node).isHydrated()) {
			this.#invalidated = true;
			return;
		}

		this.#locationObservationOff = onTreeNodeHydrated(node, () => {
			this.#locationObservationOff = undefined;
			const flexContext = getKernel(node).context.flexContext;
			assert(flexContext.isHydrated(), "Expected a hydrated tree context");
			const checkout = flexContext.checkout;
			if (checkout.isBatchInProgress) {
				const offAfterBatch = checkout.events.on("afterBatch", () => {
					offAfterBatch();
					this.#locationObservationOff = undefined;
					this.#invalidateLocation();
				});
				this.#locationObservationOff = offAfterBatch;
			} else {
				this.#invalidateLocation();
			}
		});
	}

	#stopLocationObservation(): void {
		this.#locationObservationOff?.();
		this.#locationObservationOff = undefined;
		this.#stopTreeObservation();
	}

	#startTreeObservation(): void {
		if (
			this.#treeObservationOff !== undefined ||
			this.location.type !== "document" ||
			!this.#events.hasListeners("treeChanged") ||
			!this.location.branch.compatibility.canView
		) {
			return;
		}

		const root = this.location.branch.root;
		if (isTreeNode(root)) {
			this.#treeObservationOff = treeNodeApi.on(root, "treeChanged", () => {
				this.#emit("treeChanged");
			});
		}
	}

	#stopTreeObservation(): void {
		this.#treeObservationOff?.();
		this.#treeObservationOff = undefined;
	}

	#readDocumentRoot(
		branch: SchematizingSimpleTreeView<ImplicitFieldSchema>,
	): TreeNode | TreeLeafValue | undefined {
		return branch.compatibility.canView ? branch.root : undefined;
	}

	#invalidateLocation(): void {
		if (this.#invalidated) {
			return;
		}
		this.#invalidated = true;
		this.#stopLocationObservation();
		try {
			this.#emitLocationChanged();
		} finally {
			if (this.#pendingEvents.size === 0) {
				this.#clearInvalidatedLocationListeners();
			}
		}
	}

	#emitLocationChanged(): void {
		this.#emit("nodeChanged");
		this.#emit("treeChanged");
	}

	#emit(eventName: keyof ParentEvents): void {
		if (!this.#events.hasListeners(eventName)) {
			return;
		}
		if (bufferTreeEvent(this, true) || this.#pendingEvents.size > 0) {
			this.#pendingEvents.add(eventName);
		} else {
			this.#emitNow(eventName);
		}
	}

	#emitNow(eventName: keyof ParentEvents): void {
		if (!this.#events.hasListeners(eventName)) {
			return;
		}
		if (eventName === "nodeChanged") {
			this.#events.emit(eventName, {});
		} else {
			this.#events.emit(eventName);
		}
	}
}
