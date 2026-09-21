/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";

import {
	type ChangeAtomId,
	type ChangeAtomIdRangeMap,
	type RevisionTag,
	makeChangeAtomId,
	newChangeAtomIdRangeMap,
} from "../../core/index.js";

import type { Mark } from "./types.js";
import {
	getInputCellId,
	getInputLength,
	getOutputCellId,
	getOutputLength,
	isDetach,
	isImpactful,
} from "./utils.js";

export type MarkContext = "input" | "output";
type IdContext = MarkContext | "detach";
type IdRanges = Pick<ChangeAtomIdRangeMap<true>, "entries" | "getFirst">;

interface MarkSegmentSummary {
	readonly count: number;
	readonly inputLength: number;
	readonly outputLength: number;
	readonly markCount: number;
	readonly reusable: boolean;
	/** Defined only when every cell in the segment is empty and its IDs are contiguous. */
	readonly inputCellId: ChangeAtomId | undefined;
	/** Defined only when every cell in the segment is empty and its IDs are contiguous. */
	readonly outputCellId: ChangeAtomId | undefined;
	readonly ids: Readonly<Record<IdContext, IdRanges>>;
}

/**
 * A node in a static, balanced mark tree. Marks and nodes must not be mutated after indexing.
 */
export type MarkSegmentNode = MarkSegmentSummary &
	(
		| { readonly mark: Mark }
		| { readonly left: MarkSegmentNode; readonly right: MarkSegmentNode }
	);

/**
 * Immutable index over a borrowed mark array. Queries return positions in that array,
 * not marks or subtrees. The array and its marks must not be mutated after indexing.
 *
 * The midpoint tree takes linear work to build apart from ID indexing. This naive implementation
 * copies child ID ranges into each ancestor: up to O(n log n) stored ranges and O(n log^2 n)
 * construction work for n marks. Merging large ID sets is not a constant-time operation.
 * Index lookup takes O(log n); ID lookup performs a range-map lookup at each tree level
 * (O(log^2 n) worst case). Reusable-prefix lookup visits O(log n) nodes, skipping
 * whole aligned segments using their summaries.
 */
export class MarkSegmentTree {
	public readonly root: MarkSegmentNode | undefined;

	private constructor(public readonly marks: readonly Mark[]) {
		this.root = marks.length === 0 ? undefined : build(marks, 0, marks.length);
	}

	public static fromMarks(marks: readonly Mark[]): MarkSegmentTree {
		return new MarkSegmentTree(marks);
	}

	public get count(): number {
		return this.root?.count ?? 0;
	}

	public get inputLength(): number {
		return this.root?.inputLength ?? 0;
	}

	public get outputLength(): number {
		return this.root?.outputLength ?? 0;
	}

	public get markCount(): number {
		return this.root?.markCount ?? 0;
	}

	public get reusable(): boolean {
		return this.root?.reusable ?? true;
	}

	/** Returns the array index of the mark containing a populated cell in the selected context. */
	public findByIndex(index: number, context: MarkContext): number | undefined {
		let node = this.root;
		if (
			node === undefined ||
			!Number.isInteger(index) ||
			index < 0 ||
			index >= contextLength(node, context)
		) {
			return undefined;
		}
		let markIndex = 0;
		let offset = index;
		while (!("mark" in node)) {
			const leftLength = contextLength(node.left, context);
			if (offset < leftLength) {
				node = node.left;
			} else {
				offset -= leftLength;
				markIndex += node.left.markCount;
				node = node.right;
			}
		}
		return markIndex;
	}

	/**
	 * Returns the array index of the first mark containing an empty-cell ID or detach operation ID.
	 * Detach operation IDs are distinct from the output cell IDs supplied by `idOverride`.
	 */
	public findById(id: ChangeAtomId, context: IdContext): number | undefined {
		let node = this.root;
		if (node?.ids[context].getFirst(id, 1).value === undefined) {
			return undefined;
		}
		let markIndex = 0;
		while (!("mark" in node)) {
			if (node.left.ids[context].getFirst(id, 1).value === undefined) {
				markIndex += node.left.markCount;
				node = node.right;
			} else {
				node = node.left;
			}
		}
		return markIndex;
	}

	/**
	 * Returns the exclusive array index of the reusable prefix starting at `start`.
	 * Only whole marks aligned with the opposing pure no-op are included. Stops at the
	 * first unsafe mark, alignment mismatch, or partial mark; returns `start` if none fit.
	 * An absent no-op represents an implicit unchanged suffix.
	 */
	public findReusableEnd(start: number, noop: Mark | undefined, context: MarkContext): number {
		assert(
			Number.isInteger(start) && start >= 0 && start <= this.marks.length,
			"Expected an array boundary within the indexed marks",
		);
		assert(
			noop === undefined || (noop.type === undefined && noop.changes === undefined),
			"Only pure no-ops permit reusable alignment queries",
		);
		let end = start;
		let count = 0;
		const visit = (node: MarkSegmentNode, nodeStart: number): boolean => {
			const nodeEnd = nodeStart + node.markCount;
			if (nodeEnd <= start) {
				return true;
			}
			if (
				nodeStart >= start &&
				node.reusable &&
				isAlignedWithNoop(node, noop, context, count)
			) {
				end = nodeEnd;
				count += node.count;
				return true;
			}
			if ("mark" in node) {
				return false;
			}
			// Short-circuit at the first blocker, rather than searching past it.
			return visit(node.left, nodeStart) && visit(node.right, nodeStart + node.left.markCount);
		};
		if (this.root !== undefined) {
			visit(this.root, 0);
		}
		return end;
	}

	/** Reads the root's aggregated ranges, without visiting marks. */
	public getCellSources(context: MarkContext): ReadonlySet<RevisionTag | undefined> {
		const sources = new Set<RevisionTag | undefined>();
		if (this.root !== undefined) {
			for (const { start } of this.root.ids[context].entries()) {
				sources.add(start.revision);
			}
		}
		return sources;
	}
}

function contextLength(node: MarkSegmentNode, context: MarkContext): number {
	return context === "input" ? node.inputLength : node.outputLength;
}

function isAlignedWithNoop(
	node: MarkSegmentNode,
	noop: Mark | undefined,
	context: MarkContext,
	count: number,
): boolean {
	if (noop === undefined) {
		return true;
	}
	if (node.count > noop.count - count) {
		return false;
	}
	if (noop.cellId === undefined) {
		// A full-cell no-op cannot cover intervening empty cells.
		return contextLength(node, context) === node.count;
	}
	// The summary ID exists only for a wholly empty, consecutive ID run.
	const cellId = context === "input" ? node.inputCellId : node.outputCellId;
	return (
		cellId !== undefined &&
		cellId.revision === noop.cellId.revision &&
		cellId.localId === noop.cellId.localId + count
	);
}

function markId(mark: Mark, context: IdContext): ChangeAtomId | undefined {
	if (context === "input") {
		return getInputCellId(mark);
	}
	if (context === "output") {
		return getOutputCellId(mark);
	}
	const effect = mark.type === "AttachAndDetach" ? mark.detach : mark;
	return isDetach(effect) ? makeChangeAtomId(effect.id, effect.revision) : undefined;
}

function leafRanges(id: ChangeAtomId | undefined, count: number): IdRanges {
	const ranges = newChangeAtomIdRangeMap<true>();
	if (id !== undefined && count > 0) {
		ranges.set(id, count, true);
	}
	return ranges;
}

function mergeRanges(left: IdRanges, right: IdRanges): IdRanges {
	const ranges = newChangeAtomIdRangeMap<true>();
	for (const child of [left, right]) {
		for (const { start, length } of child.entries()) {
			ranges.set(start, length, true);
		}
	}
	return ranges;
}

function contiguousId(
	left: MarkSegmentNode,
	right: MarkSegmentNode,
	context: MarkContext,
): ChangeAtomId | undefined {
	const leftId = context === "input" ? left.inputCellId : left.outputCellId;
	const rightId = context === "input" ? right.inputCellId : right.outputCellId;
	return leftId !== undefined &&
		rightId !== undefined &&
		leftId.revision === rightId.revision &&
		leftId.localId + left.count === rightId.localId
		? leftId
		: undefined;
}

function build(marks: readonly Mark[], start: number, end: number): MarkSegmentNode {
	if (end - start === 1) {
		const mark = marks[start];
		assert(mark !== undefined, "A leaf must refer to an existing mark");
		assert(
			Number.isSafeInteger(mark.count) && mark.count >= 0,
			"A mark count must be a nonnegative safe integer",
		);
		const inputCellId = getInputCellId(mark);
		const outputCellId = getOutputCellId(mark);
		return {
			mark,
			count: mark.count,
			inputLength: getInputLength(mark),
			outputLength: getOutputLength(mark),
			markCount: 1,
			reusable:
				mark.changes === undefined &&
				mark.type !== "MoveIn" &&
				mark.type !== "MoveOut" &&
				mark.type !== "AttachAndDetach" &&
				(mark.type === undefined || isImpactful(mark)),
			inputCellId,
			outputCellId,
			ids: {
				input: leafRanges(inputCellId, mark.count),
				output: leafRanges(outputCellId, mark.count),
				detach: leafRanges(markId(mark, "detach"), mark.count),
			},
		};
	}
	const midpoint = start + Math.floor((end - start) / 2);
	const left = build(marks, start, midpoint);
	const right = build(marks, midpoint, end);
	return {
		left,
		right,
		count: left.count + right.count,
		inputLength: left.inputLength + right.inputLength,
		outputLength: left.outputLength + right.outputLength,
		markCount: left.markCount + right.markCount,
		reusable: left.reusable && right.reusable,
		inputCellId: contiguousId(left, right, "input"),
		outputCellId: contiguousId(left, right, "output"),
		ids: {
			input: mergeRanges(left.ids.input, right.ids.input),
			output: mergeRanges(left.ids.output, right.ids.output),
			detach: mergeRanges(left.ids.detach, right.ids.detach),
		},
	};
}
