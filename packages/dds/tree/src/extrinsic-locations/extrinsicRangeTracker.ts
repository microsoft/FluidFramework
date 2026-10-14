/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, isPromiseLike } from "@fluidframework/core-utils/internal";
import { UsageError } from "@fluidframework/telemetry-utils/internal";

import { TreeAlpha } from "../shared-tree/index.js";
import {
	createArrayInsertionAnchor,
	type ArrayPlaceAnchor,
	type ImplicitAllowedTypes,
	type TreeArrayNode,
	type TreeNode,
} from "../simple-tree/index.js";
import { validateIndexRange } from "../util/index.js";

/**
 * Persisted indexes delimiting a half-open range.
 */
interface RangeEndpoints {
	start: number;
	end: number;
}

/**
 * Temporary anchors used while editing content.
 */
interface RangeAnchors {
	start: ArrayPlaceAnchor;
	end: ArrayPlaceAnchor;
}

/**
 * Maintains tree-backed range endpoints while editing an array, without defining its schema.
 * @remarks
 * Reuse one instance for each content array and range collection so all operations share the active editing scope.
 * Both arrays must be unhydrated or belong to the same hydrated tree context.
 * Their enclosing schema and the range nodes' additional fields are chosen by the caller.
 *
 * Structural content edits must use {@link ExtrinsicRangeTracker.transactOnContent}.
 * Content events are not buffered.
 * Position reads use temporary insertion anchors until the callback and endpoint writeback finish.
 * The array-anchor event-ordering limitation also applies to these reads.
 *
 * This helper is exported only from this module, not from the package entrypoints.
 */
export class ExtrinsicRangeTracker<
	TContent extends TreeArrayNode,
	TRange extends TreeNode & RangeEndpoints,
	TRangeData,
> {
	#anchors: Map<TRange, RangeAnchors> | undefined;

	/**
	 * Creates a tracker over existing arrays, including any ranges already stored in the collection.
	 * @param content - Array whose insertion points the ranges refer to.
	 * @param ranges - Tree-backed collection of range nodes with writable numeric `start` and `end` fields.
	 * @param createRange - Creates an unhydrated range node containing the supplied endpoints and application data.
	 */
	public constructor(
		private readonly content: TContent,
		private readonly ranges: TreeArrayNode<ImplicitAllowedTypes, TRange, TRange>,
		private readonly createRange: (start: number, end: number, data: TRangeData) => TRange,
	) {}

	/**
	 * Edits content and writes the tracked endpoints back within the same guarded transaction.
	 * @param edit - Synchronous callback with mutable access to the original array.
	 * @remarks
	 * Range operations can be used within the callback, but editing scopes on this tracker cannot be nested.
	 * Temporary anchors are disposed on every exit path.
	 * Unhydrated edits cannot roll back, so their endpoints are written back even if the callback throws.
	 * Errors on hydrated nodes have the same effect as errors in `runTransaction`.
	 */
	public transactOnContent(edit: (content: TContent) => void): void {
		if (this.#anchors !== undefined) {
			throw new UsageError("Cannot nest transactOnContent calls on the same array.");
		}
		const context = TreeAlpha.context(this.content);
		assert(
			context === TreeAlpha.context(this.ranges),
			"Content and ranges must belong to the same tree context.",
		);
		const apply = (): void => {
			const anchors = new Map<TRange, RangeAnchors>();
			this.#anchors = anchors;
			let completed = false;
			try {
				for (const range of this.ranges) {
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
		if (context.isView()) {
			context.runTransaction(
				() => {
					apply();
					return { preconditionsOnRevert: [{ type: "noChange" }] };
				},
				{ preconditions: [{ type: "noChange" }] },
			);
		} else {
			apply();
		}
	}

	/**
	 * Gets a snapshot of a range's current endpoints.
	 * @param range - A stored range node, possibly exposed through a type that hides its endpoints.
	 * Membership is checked by object identity.
	 * @returns The current inclusive start and exclusive end indexes.
	 */
	public getExtrinsicRange(range: object): Readonly<RangeEndpoints> {
		const node = this.#findRange(range);
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
	 * Creates and inserts a range using the supplied node factory.
	 * @param start - Inclusive start index.
	 * @param end - Exclusive end index.
	 * @param data - Application data passed to the node factory.
	 * @returns The inserted range node.
	 */
	public addExtrinsicRange(start: number, end: number, data: TRangeData): TRange {
		validateIndexRange(start, end, this.content, "ExtrinsicRangeTracker.addExtrinsicRange");
		const range = this.createRange(start, end, data);
		this.#applyEdit(() => {
			this.#setAnchors(range, start, end);
			this.ranges.insertAtEnd(range);
		});
		return range;
	}

	/**
	 * Repositions a range without replacing its node.
	 * @param range - A range currently in the collection.
	 * @param start - New inclusive start index.
	 * @param end - New exclusive end index.
	 */
	public setExtrinsicRange(range: object, start: number, end: number): void {
		const node = this.#findRange(range);
		validateIndexRange(start, end, this.content, "ExtrinsicRangeTracker.setExtrinsicRange");
		this.#applyEdit(() => {
			this.#setAnchors(node, start, end);
		});
	}

	/**
	 * Removes a range without editing the content.
	 * @param range - A range currently in the collection.
	 */
	public removeExtrinsicRange(range: object): void {
		const node = this.#findRange(range);
		this.#applyEdit(() => {
			assert(this.#anchors !== undefined, "Range edits must run in an editing scope.");
			const anchors = this.#anchors.get(node);
			assert(anchors !== undefined, "A range being removed must have anchors.");
			anchors.start.dispose();
			anchors.end.dispose();
			this.#anchors.delete(node);
			this.ranges.removeAt(this.ranges.indexOf(node));
		});
	}

	#findRange(range: object): TRange {
		const node = this.ranges.find((candidate) => candidate === range);
		if (node === undefined) {
			throw new UsageError("The extrinsic range does not belong to this array.");
		}
		return node;
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

	#applyEdit(edit: () => void): void {
		if (this.#anchors === undefined) {
			this.transactOnContent(() => edit());
		} else {
			edit();
		}
	}
}
