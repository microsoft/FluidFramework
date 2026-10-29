/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { FluidReadonlyMap } from "@fluidframework/core-interfaces";
import { assert, isPromiseLike } from "@fluidframework/core-utils/internal";
import { UsageError } from "@fluidframework/telemetry-utils/internal";

import { TreeAlpha } from "../shared-tree/index.js";
import {
	createArrayInsertionAnchor,
	type ArrayPlaceAnchor,
	type TreeArrayNode,
	type TreeNode,
} from "../simple-tree/index.js";
import { validateIndexRange } from "../util/index.js";
import type { ExtrinsicLocations } from "./extrinsicLocationsNamespace.js";

/**
 * Persisted indexes delimiting a half-open range.
 */
interface StoredRangeEndpoints {
	start: number;
	end: number;
}

/**
 * Temporary anchors used while editing content.
 */
interface ActiveRangeAnchors {
	start: ArrayPlaceAnchor;
	end: ArrayPlaceAnchor;
}

/**
 * Tree-backed map whose range layout is supplied by the caller.
 */
interface RangeMap<TRange> extends TreeNode, FluidReadonlyMap<string, TRange> {
	set(key: string, value: TRange): void;
	delete(key: string): void;
}

/**
 * Runs an edit with the constraints required to maintain persisted range indexes.
 * @param node - Node whose tree context contains all edited content and ranges.
 * @param edit - Synchronous edit, including any initialization of range storage.
 * @returns The result of the edit.
 */
export function runRangeTransaction<T>(node: TreeNode, edit: () => T): T {
	const context = TreeAlpha.context(node);
	return context.isView()
		? context.runTransaction<T, never>(
				() => ({
					value: edit(),
					preconditionsOnRevert: [{ type: "noChange" }],
				}),
				{ preconditions: [{ type: "noChange" }] },
			).value
		: edit();
}

/**
 * Maintains tree-backed range endpoints while editing an array, without defining its schema.
 * @remarks
 * Reuse one instance for each content array and range collection so all operations share the active editing scope.
 * The content array and range map must be unhydrated or belong to the same hydrated tree context.
 * Their enclosing schema and the range nodes' additional fields are chosen by the caller.
 *
 * Structural content edits must use {@link ExtrinsicRangeTracker.transactOnContent}.
 * Content change listeners run synchronously during individual edits.
 * Their notifications are not delayed until the editing callback finishes or the stored endpoints are updated.
 * Position reads use temporary insertion anchors until the callback and endpoint writeback finish.
 * The array-anchor event-ordering limitation also applies to these reads.
 *
 * This helper is exported only from this module, not from the package entrypoints.
 */
export class ExtrinsicRangeTracker<
	TContent extends TreeArrayNode,
	TRange extends TreeNode & StoredRangeEndpoints & { data: unknown },
	TRangeData,
> implements ExtrinsicLocations.RangeCollection<TRange["data"], TRangeData>
{
	#anchors: Map<TRange, ActiveRangeAnchors> | undefined;

	/**
	 * Creates a tracker over existing content and a string-keyed map of extrinsic ranges.
	 * @param content - Array whose insertion points the ranges refer to.
	 * @param getRanges - Reads the current optional range storage without creating it, so reading ranges does not edit the tree.
	 * @param ensureRanges - Returns existing range storage or creates it when an edit first needs it.
	 * On hydrated nodes, the tracker calls this inside a guarded transaction so storage creation and the edit are atomic.
	 * Formatted text uses this to initialize optional storage lazily; arrays already have storage and return it unchanged.
	 * @param createRange - Creates an unhydrated range node containing the supplied endpoints and application data.
	 */
	public constructor(
		private readonly content: TContent,
		private readonly getRanges: () => RangeMap<TRange> | undefined,
		private readonly ensureRanges: () => RangeMap<TRange>,
		private readonly createRange: (start: number, end: number, data: TRangeData) => TRange,
	) {}

	/**
	 * Edits content and writes the tracked endpoints back within the same guarded transaction.
	 * @param edit - Synchronous callback with mutable access to the original array.
	 * @remarks
	 * Ranges can be read and their data edited within the callback.
	 * Adding or removing ranges and explicitly changing bounds are forbidden during the
	 * {@link ExtrinsicLocations.ArrayMembers.transactOnContent | tracked content edit} and the subsequent range updates.
	 * Editing scopes on this tracker cannot be nested.
	 * Temporary anchors are disposed on every exit path.
	 * Unhydrated edits cannot roll back, so their endpoints are written back even if the callback throws.
	 * Errors on hydrated nodes have the same effect as errors in `runTransaction`.
	 */
	public transactOnContent(edit: (content: TContent) => void): void {
		if (this.#anchors !== undefined) {
			throw new UsageError("Cannot nest transactOnContent calls on the same array.");
		}
		const context = TreeAlpha.context(this.content);
		const apply = (): void => {
			const ranges = this.ensureRanges();
			assert(
				context === TreeAlpha.context(ranges),
				"Content and ranges must belong to the same tree context.",
			);
			const anchors = new Map<TRange, ActiveRangeAnchors>();
			this.#anchors = anchors;
			let completed = false;
			try {
				for (const range of ranges.values()) {
					this.#setAnchors(range, range.start, range.end);
				}
				const result: unknown = edit(this.content);
				if (isPromiseLike(result)) {
					throw new UsageError("transactOnContent requires a synchronous callback.");
				}
				completed = true;
			} finally {
				try {
					// Unhydrated edits cannot roll back, so retain consistent endpoints even
					// if the callback throws. Do not edit a hydrated view after an error.
					if (completed || !context.isView()) {
						for (const [range, positions] of anchors) {
							range.start = positions.start.index;
							range.end = positions.end.index;
						}
					}
				} finally {
					for (const positions of anchors.values()) {
						positions.start.dispose();
						positions.end.dispose();
					}
					this.#anchors = undefined;
				}
			}
		};
		runRangeTransaction(this.content, apply);
	}

	/**
	 * {@inheritDoc ExtrinsicLocations.RangeCollection.getRange}
	 */
	public getRange(
		key: string,
	): ExtrinsicLocations.TrackedRange<TRange["data"], TRangeData> | undefined {
		const node = this.getRanges()?.get(key);
		return node === undefined ? undefined : this.#createHandle(key, node);
	}

	/**
	 * {@inheritDoc ExtrinsicLocations.RangeCollection.keys}
	 */
	public keys(): IterableIterator<string> {
		return this.getRanges()?.keys() ?? [][Symbol.iterator]();
	}

	#createHandle(
		key: string,
		node: TRange,
	): ExtrinsicLocations.TrackedRange<TRange["data"], TRangeData> {
		const getBounds = (): ExtrinsicLocations.RangeEndpoints => this.#getRangeBounds(key, node);
		const setData = (data: TRangeData): void => {
			this.#requireTrackedRange(key, node);
			node.data = data;
		};
		const dispose = (): never => {
			throw new UsageError(
				"Range endpoint anchors are owned by the tracked range. Use removeTrackedRange to remove it.",
			);
		};
		return {
			start: {
				get index() {
					return getBounds().start;
				},
				dispose,
			},
			end: {
				get index() {
					return getBounds().end;
				},
				dispose,
			},
			get data(): TRange["data"] {
				return node.data;
			},
			set data(value: TRangeData) {
				setData(value);
			},
		};
	}

	#requireTrackedRange(key: string, node: TRange): void {
		if (this.getRanges()?.get(key) !== node) {
			throw new UsageError("The extrinsic range is no longer tracked.");
		}
	}

	#getRangeBounds(key: string, node: TRange): ExtrinsicLocations.RangeEndpoints {
		this.#requireTrackedRange(key, node);
		const anchors = this.#anchors?.get(node);
		assert(
			this.#anchors === undefined || anchors !== undefined,
			"Every range must have anchors while editing content.",
		);
		return {
			start: anchors?.start.index ?? node.start,
			end: anchors?.end.index ?? node.end,
		};
	}

	/**
	 * {@inheritDoc ExtrinsicLocations.RangeCollection.trackNewRange}
	 */
	public trackNewRange(
		key: string,
		{ start, end }: ExtrinsicLocations.RangeEndpoints,
		data: TRangeData,
	): ExtrinsicLocations.TrackedRange<TRange["data"], TRangeData> {
		this.#checkNotEditingContent();
		if (this.getRanges()?.has(key) === true) {
			throw new UsageError("An extrinsic range is already tracked at this key.");
		}
		validateIndexRange(start, end, this.content, "ExtrinsicRangeTracker.trackNewRange");
		const range = this.createRange(start, end, data);
		this.transactOnContent(() => {
			this.#setAnchors(range, start, end);
			this.#requireRanges().set(key, range);
		});
		return this.#createHandle(key, range);
	}

	/**
	 * {@inheritDoc ExtrinsicLocations.RangeCollection.setRangeBounds}
	 */
	public setRangeBounds(key: string, { start, end }: ExtrinsicLocations.RangeEndpoints): void {
		this.#checkNotEditingContent();
		const node = this.#findRange(key);
		validateIndexRange(start, end, this.content, "ExtrinsicRangeTracker.setRangeBounds");
		this.transactOnContent(() => {
			this.#setAnchors(node, start, end);
		});
	}

	/**
	 * Removes a range without editing the content.
	 * @param key - Key of a tracked extrinsic range.
	 */
	public removeTrackedRange(key: string): void {
		this.#checkNotEditingContent();
		const node = this.#findRange(key);
		this.transactOnContent(() => {
			assert(this.#anchors !== undefined, "Range edits must run in an editing scope.");
			const anchors = this.#anchors.get(node);
			assert(anchors !== undefined, "A range being removed must have anchors.");
			anchors.start.dispose();
			anchors.end.dispose();
			this.#anchors.delete(node);
			this.#requireRanges().delete(key);
		});
	}

	#findRange(key: string): TRange {
		const node = this.getRanges()?.get(key);
		if (node === undefined) {
			throw new UsageError("The extrinsic range key is not tracked.");
		}
		return node;
	}

	#requireRanges(): RangeMap<TRange> {
		const ranges = this.getRanges();
		assert(ranges !== undefined, "Range edits require initialized storage.");
		return ranges;
	}

	#setAnchors(range: TRange, start: number, end: number): void {
		assert(this.#anchors !== undefined, "Range edits must run in an editing scope.");
		const startAnchor = createArrayInsertionAnchor(this.content, start);
		let endAnchor: ArrayPlaceAnchor;
		try {
			endAnchor = createArrayInsertionAnchor(this.content, end);
		} catch (error) {
			startAnchor.dispose();
			throw error;
		}
		const previous = this.#anchors.get(range);
		previous?.start.dispose();
		previous?.end.dispose();
		this.#anchors.set(range, { start: startAnchor, end: endAnchor });
	}

	#checkNotEditingContent(): void {
		if (this.#anchors !== undefined) {
			throw new UsageError(
				"Cannot add or remove ranges or change their bounds while editing content.",
			);
		}
	}
}
