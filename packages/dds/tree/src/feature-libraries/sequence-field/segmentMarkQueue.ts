/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";

import { offsetChangeAtomId } from "../../core/index.js";

import { MarkSegmentTree, type MarkContext, type MarkSegmentNode } from "./markSegmentTree.js";
import { getFirstMoveEffectLength, type MoveEffectTable } from "./moveEffectTable.js";
import type { Mark } from "./types.js";
import { areEqualCellIds, getInputLength, getOutputLength, splitMark } from "./utils.js";

/**
 * A cursor over immutable subtrees. Only the path to a consumed mark is expanded;
 * a reusable subtree can instead be removed from the frontier in constant time.
 */
export class SegmentMarkQueue {
	private readonly stack: MarkSegmentNode[] = [];
	private residue: Mark | undefined;
	private consumedCount = 0;
	private consumedInputLength = 0;
	private consumedOutputLength = 0;

	public constructor(
		private readonly tree: MarkSegmentTree,
		private readonly moveEffects: MoveEffectTable,
	) {
		if (tree.root !== undefined) {
			this.stack.push(tree.root);
		}
	}

	public isEmpty(): boolean {
		return this.residue === undefined && this.stack.length === 0;
	}

	/**
	 * Locates the exclusive end of a pure no-op in the original tree's mark-count coordinates.
	 * A full-cell no-op starts at the cursor's populated-cell index in `context`;
	 * an empty-cell no-op is located by its last cell ID instead.
	 *
	 * Returns undefined if the last cell is absent (including an implicit unchanged suffix)
	 * or already consumed. Finding the endpoint does not establish alignment of the
	 * intervening cells or permit skipping their effects.
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
		const location =
			noop.cellId === undefined
				? this.tree.findByIndex(position + noop.count - 1, context)
				: this.tree.findById(offsetChangeAtomId(noop.cellId, noop.count - 1), context);
		if (location === undefined) {
			return undefined;
		}
		const end = location.countBefore + location.offset + 1;
		return end > this.consumedCount ? end : undefined;
	}

	public peek(): Mark | undefined {
		let mark = this.residue;
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
		let mark = this.residue;
		if (mark === undefined) {
			let node = this.stack.pop();
			assert(node !== undefined, "Unexpected end of segment mark queue");
			while (!("mark" in node)) {
				this.stack.push(node.right);
				node = node.left;
			}
			mark = node.mark;
		}
		this.residue = undefined;
		const count = Math.min(
			length,
			getFirstMoveEffectLength(mark, mark.count, this.moveEffects),
		);
		if (count < mark.count) {
			const [head, tail] = splitMark(mark, count);
			this.residue = tail;
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
		if (this.residue !== undefined) {
			return undefined;
		}
		const end = noop === undefined ? undefined : this.findNoopEnd(noop, context);
		while (this.stack.length > 0) {
			const node = this.stack.at(-1);
			assert(node !== undefined, "Expected a segment on the frontier");
			if (node.reusable && this.isAlignedWithNoop(node, noop, context, end)) {
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

	/**
	 * Checks whether the next subtree fits within the opposing no-op's cells in `context`.
	 * `end`, when known, is the exclusive boundary in the original tree's mark-count coordinates.
	 * Alignment alone does not establish that the subtree's effects are reusable.
	 */
	private isAlignedWithNoop(
		node: MarkSegmentNode,
		noop: Mark | undefined,
		context: MarkContext,
		end: number | undefined,
	): boolean {
		if (noop === undefined) {
			// An exhausted changeset leaves the remaining cells unchanged.
			return true;
		}
		if (node.count > noop.count) {
			return false;
		}
		if (end !== undefined && this.consumedCount + node.count > end) {
			return false;
		}

		const populatedLength = context === "input" ? node.inputLength : node.outputLength;
		if (noop.cellId === undefined) {
			// A full-cell no-op cannot cover intervening empty cells.
			return populatedLength === node.count;
		}

		// The summary ID exists only for a wholly empty, consecutive ID run.
		const cellId = context === "input" ? node.inputCellId : node.outputCellId;
		return populatedLength === 0 && areEqualCellIds(noop.cellId, cellId);
	}

	private advance(count: number, inputLength: number, outputLength: number): void {
		this.consumedCount += count;
		this.consumedInputLength += inputLength;
		this.consumedOutputLength += outputLength;
	}
}
