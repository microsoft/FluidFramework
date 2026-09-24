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
	offsetChangeAtomId,
} from "../../core/index.js";

import type { Mark } from "./types.js";
import {
	areEqualCellIds,
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

interface MarkRangeIndex {
	readonly summary: MarkSegmentSummary;
	readonly countBefore: number;
	readonly inputBefore: number;
	readonly outputBefore: number;
	/** Exclusive end of the reusable run, regardless of cell alignment. */
	readonly reusableEnd: number;
	/** Exclusive end of the reusable run of full cells or consecutive empty-cell IDs. */
	readonly inputEnd: number;
	readonly outputEnd: number;
}

/**
 * Immutable index over a borrowed mark array. Queries return positions in that array,
 * not marks or subtrees. The array and its marks must not be mutated after indexing.
 *
 * The midpoint tree takes linear work to build apart from ID indexing. This naive implementation
 * copies child ID ranges into each ancestor: up to O(n log n) stored ranges and O(n log^2 n)
 * construction work for n marks. Merging large ID sets is not a constant-time operation.
 * Index lookup takes O(log n); ID lookup performs a range-map lookup at each tree level
 * (O(log^2 n) worst case). An additional O(n) pass and storage precompute prefix lengths
 * and safe run ends, making range safety checks after an endpoint lookup O(1).
 */
export class MarkSegmentTree {
	public readonly root: MarkSegmentNode | undefined;
	private readonly rangeIndex: readonly MarkRangeIndex[];

	private constructor(public readonly marks: readonly Mark[]) {
		const leaves: MarkSegmentSummary[] = [];
		this.root = marks.length === 0 ? undefined : build(marks, 0, marks.length, leaves);
		const ranges: MarkRangeIndex[] = [];
		let countBefore = this.count;
		let inputBefore = this.inputLength;
		let outputBefore = this.outputLength;
		for (let index = leaves.length - 1; index >= 0; index--) {
			const summary = leaves[index];
			assert(summary !== undefined, "Expected an indexed mark summary");
			const next = ranges[index + 1];
			countBefore -= summary.count;
			inputBefore -= summary.inputLength;
			outputBefore -= summary.outputLength;
			ranges[index] = {
				summary,
				countBefore,
				inputBefore,
				outputBefore,
				reusableEnd: summary.reusable ? (next?.reusableEnd ?? index + 1) : index,
				inputEnd: summary.reusable
					? next !== undefined && areConsecutiveCells(summary, next.summary, "input")
						? next.inputEnd
						: index + 1
					: index,
				outputEnd: summary.reusable
					? next !== undefined && areConsecutiveCells(summary, next.summary, "output")
						? next.outputEnd
						: index + 1
					: index,
			};
		}
		this.rangeIndex = ranges;
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
	 *
	 * Locates the last covered cell with findByIndex or findById, then clamps the candidate
	 * boundary to the precomputed safe run. No range traversal or per-mark validation is needed.
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
		if (start === this.marks.length) {
			return start;
		}
		const first = this.rangeIndex[start];
		assert(first !== undefined, "Expected a range index for the first mark");
		if (noop === undefined) {
			return first.reusableEnd;
		}
		const cellId =
			context === "input" ? first.summary.inputCellId : first.summary.outputCellId;
		if (noop.count === 0 || !areEqualCellIds(noop.cellId, cellId)) {
			return start;
		}

		const position = context === "input" ? first.inputBefore : first.outputBefore;
		const endpoint =
			noop.cellId === undefined
				? this.findByIndex(position + noop.count - 1, context)
				: this.findById(offsetChangeAtomId(noop.cellId, noop.count - 1), context);
		if (endpoint !== undefined && endpoint < start) {
			// ID lookup returns the first occurrence, which may already have been consumed.
			return start;
		}
		const safeEnd = context === "input" ? first.inputEnd : first.outputEnd;
		// A missing endpoint extends past the safe run: inside a matching full-cell or
		// consecutive-ID run, every covered cell is indexed.
		let end = Math.min(safeEnd, endpoint === undefined ? this.marks.length : endpoint + 1);
		if (end > start) {
			const last = this.rangeIndex[end - 1];
			assert(last !== undefined, "Expected a range index for the last mark");
			if (last.countBefore + last.summary.count - first.countBefore > noop.count) {
				// Leave an incompletely covered endpoint mark to the ordinary splitting path.
				end--;
			}
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

function areConsecutiveCells(
	left: MarkSegmentSummary,
	right: MarkSegmentSummary,
	context: MarkContext,
): boolean {
	const leftId = context === "input" ? left.inputCellId : left.outputCellId;
	const rightId = context === "input" ? right.inputCellId : right.outputCellId;
	return (
		(leftId === undefined && rightId === undefined) ||
		contiguousId(left, right, context) !== undefined
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
	left: MarkSegmentSummary,
	right: MarkSegmentSummary,
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

function build(
	marks: readonly Mark[],
	start: number,
	end: number,
	leaves: MarkSegmentSummary[],
): MarkSegmentNode {
	if (end - start === 1) {
		const mark = marks[start];
		assert(mark !== undefined, "A leaf must refer to an existing mark");
		assert(
			Number.isSafeInteger(mark.count) && mark.count >= 0,
			"A mark count must be a nonnegative safe integer",
		);
		const inputCellId = getInputCellId(mark);
		const outputCellId = getOutputCellId(mark);
		const leaf: MarkSegmentNode = {
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
		leaves.push(leaf);
		return leaf;
	}
	const midpoint = start + Math.floor((end - start) / 2);
	const left = build(marks, start, midpoint, leaves);
	const right = build(marks, midpoint, end, leaves);
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
