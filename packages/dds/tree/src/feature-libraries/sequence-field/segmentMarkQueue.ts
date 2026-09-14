/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, fail } from "@fluidframework/core-utils/internal";

import { type ChangeAtomId, offsetChangeAtomId } from "../../core/index.js";

import { MarkSegmentTree, type MarkContext, type MarkSegmentNode } from "./markSegmentTree.js";
import { getFirstMoveEffectLength, type MoveEffectTable } from "./moveEffectTable.js";
import type { Mark } from "./types.js";
import { areEqualCellIds, getInputLength, getOutputLength, splitMark } from "./utils.js";

interface NoopEndQuery {
	readonly context: MarkContext;
	readonly index: number | undefined;
	readonly cellId: ChangeAtomId | undefined;
	readonly end: number | undefined;
}

/**
 * A cursor over immutable subtrees. Only the path to a consumed mark is expanded;
 * a reusable subtree can instead be removed from the frontier in constant time.
 */
export class SegmentMarkQueue {
	private readonly stack: MarkSegmentNode[] = [];
	private pending: Mark | undefined;
	private consumedCount = 0;
	private consumedInputLength = 0;
	private consumedOutputLength = 0;
	private noopEndQuery: NoopEndQuery | undefined;

	public constructor(
		private readonly tree: MarkSegmentTree,
		private readonly moveEffects: MoveEffectTable,
	) {
		if (tree.root !== undefined) {
			this.stack.push(tree.root);
		}
	}

	public isEmpty(): boolean {
		return this.pending === undefined && this.stack.length === 0;
	}

	/**
	 * Locates the exclusive end of a pure no-op in the original tree's mark-count coordinates.
	 * A full-cell no-op starts at the cursor's populated-cell index in `context`;
	 * an empty-cell no-op is located by its last cell ID instead.
	 *
	 * Returns undefined if the last cell is absent (including an implicit unchanged suffix)
	 * or already consumed. Finding the endpoint does not establish alignment of the
	 * intervening cells or permit skipping their effects.
	 * The endpoint query is cached as the same no-op is consumed across multiple subtrees.
	 */
	public findNoopEnd(noop: Mark, context: MarkContext): number | undefined {
		assert(
			noop.type === undefined && noop.changes === undefined,
			"Only pure no-ops have reusable alignment boundaries",
		);
		if (noop.count === 0) {
			return this.consumedCount;
		}
		const position =
			context === "input" ? this.consumedInputLength : this.consumedOutputLength;
		const index = noop.cellId === undefined ? position + noop.count - 1 : undefined;
		const cellId =
			noop.cellId === undefined ? undefined : offsetChangeAtomId(noop.cellId, noop.count - 1);
		const cached = this.noopEndQuery;
		if (
			cached?.context !== context ||
			cached.index !== index ||
			!areEqualCellIds(cached.cellId, cellId)
		) {
			const location =
				cellId === undefined
					? this.tree.findByIndex(
							index ?? fail("A full-cell boundary must have an index"),
							context,
						)
					: this.tree.findById(cellId, context);
			this.noopEndQuery = {
				context,
				index,
				cellId,
				end: location === undefined ? undefined : location.countBefore + location.offset + 1,
			};
		}
		const end = this.noopEndQuery?.end;
		return end !== undefined && end > this.consumedCount ? end : undefined;
	}

	public peek(): Mark | undefined {
		let mark = this.pending;
		if (mark === undefined) {
			let node = this.stack.at(-1);
			while (node !== undefined && !("mark" in node)) {
				node = node.left;
			}
			mark = node?.mark;
		}
		if (mark === undefined) {
			return undefined;
		}
		const length = getFirstMoveEffectLength(mark, mark.count, this.moveEffects);
		return length < mark.count ? splitMark(mark, length)[0] : mark;
	}

	public dequeueUpTo(length: number): Mark {
		assert(length > 0, "Cannot dequeue a non-positive mark length");
		let mark = this.pending;
		if (mark === undefined) {
			let node = this.stack.pop();
			assert(node !== undefined, "Unexpected end of segment mark queue");
			while (!("mark" in node)) {
				this.stack.push(node.right);
				node = node.left;
			}
			mark = node.mark;
		}
		this.pending = undefined;
		const count = Math.min(
			length,
			getFirstMoveEffectLength(mark, mark.count, this.moveEffects),
		);
		if (count < mark.count) {
			const [head, tail] = splitMark(mark, count);
			this.pending = tail;
			this.advance(head.count, getInputLength(head), getOutputLength(head));
			return head;
		}
		this.advance(mark.count, getInputLength(mark), getOutputLength(mark));
		return mark;
	}

	/**
	 * Removes a whole, already-settled subtree aligned with a pure no-op.
	 * An absent no-op represents the implicit unchanged suffix of a changeset.
	 * Empty-cell blocks must cover consecutive IDs, not merely have equal counts.
	 */
	public tryDequeueReusable(
		noop: Mark | undefined,
		context: MarkContext,
	): MarkSegmentTree | undefined {
		if (this.pending !== undefined) {
			return undefined;
		}
		const end = noop === undefined ? undefined : this.findNoopEnd(noop, context);
		while (this.stack.length > 0) {
			const node = this.stack.at(-1);
			assert(node !== undefined, "Expected a segment on the frontier");
			const length = context === "input" ? node.inputLength : node.outputLength;
			const cellId = context === "input" ? node.inputCellId : node.outputCellId;
			const aligned =
				noop === undefined ||
				(node.count <= noop.count &&
					(end === undefined || this.consumedCount + node.count <= end) &&
					(noop.cellId === undefined
						? length === node.count
						: length === 0 && areEqualCellIds(noop.cellId, cellId)));
			if (node.reusable && aligned) {
				this.stack.pop();
				this.advance(node.count, node.inputLength, node.outputLength);
				return MarkSegmentTree.fromRoot(node);
			}
			if ("mark" in node) {
				return undefined;
			}
			this.stack.pop();
			this.stack.push(node.right, node.left);
		}
		return undefined;
	}

	private advance(count: number, inputLength: number, outputLength: number): void {
		this.consumedCount += count;
		this.consumedInputLength += inputLength;
		this.consumedOutputLength += outputLength;
	}
}
