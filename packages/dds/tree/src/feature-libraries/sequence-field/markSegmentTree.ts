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

interface MarkLocation {
	readonly mark: Mark;
	readonly offset: number;
	/** Sum of mark counts before this mark, independent of the queried context. */
	readonly countBefore: number;
}

/**
 * Immutable index over borrowed marks, retaining their identity.
 *
 * The midpoint tree takes linear work to build apart from ID indexing. This naive implementation
 * copies child ID ranges into each ancestor: up to O(n log n) stored ranges and O(n log^2 n)
 * construction work for n marks. Merging large ID sets is not a constant-time operation.
 * Index lookup takes O(log n); ID lookup performs a range-map lookup at each tree level
 * (O(log^2 n) worst case). Wrapping an existing subtree takes O(1).
 */
export class MarkSegmentTree implements Iterable<Mark> {
	private constructor(public readonly root: MarkSegmentNode | undefined) {}

	public static fromMarks(marks: readonly Mark[]): MarkSegmentTree {
		return new MarkSegmentTree(marks.length === 0 ? undefined : build(marks, 0, marks.length));
	}

	public static fromRoot(root: MarkSegmentNode | undefined): MarkSegmentTree {
		return new MarkSegmentTree(root);
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

	/** Finds a populated cell by its zero-based index in the selected context. */
	public findByIndex(index: number, context: MarkContext): MarkLocation | undefined {
		let node = this.root;
		if (
			node === undefined ||
			!Number.isInteger(index) ||
			index < 0 ||
			index >= contextLength(node, context)
		) {
			return undefined;
		}
		let countBefore = 0;
		let offset = index;
		while (!("mark" in node)) {
			const leftLength = contextLength(node.left, context);
			if (offset < leftLength) {
				node = node.left;
			} else {
				offset -= leftLength;
				countBefore += node.left.count;
				node = node.right;
			}
		}
		return { mark: node.mark, offset, countBefore };
	}

	/**
	 * Finds the first mark containing an empty-cell ID, or an actual detach operation ID.
	 * Detach operation IDs are distinct from the output cell IDs supplied by `idOverride`.
	 */
	public findById(id: ChangeAtomId, context: IdContext): MarkLocation | undefined {
		let node = this.root;
		if (node?.ids[context].getFirst(id, 1).value === undefined) {
			return undefined;
		}
		let countBefore = 0;
		while (!("mark" in node)) {
			if (node.left.ids[context].getFirst(id, 1).value === undefined) {
				countBefore += node.left.count;
				node = node.right;
			} else {
				node = node.left;
			}
		}
		const start = markId(node.mark, context);
		assert(start !== undefined, "An indexed mark must have an ID in the queried context");
		return { mark: node.mark, offset: id.localId - start.localId, countBefore };
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

	public *[Symbol.iterator](): IterableIterator<Mark> {
		if (this.root !== undefined) {
			yield* iterate(this.root);
		}
	}
}

function contextLength(node: MarkSegmentNode, context: MarkContext): number {
	return context === "input" ? node.inputLength : node.outputLength;
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

function* iterate(node: MarkSegmentNode): IterableIterator<Mark> {
	const stack = [node];
	while (stack.length > 0) {
		const current = stack.pop();
		assert(current !== undefined, "Expected a segment on the traversal stack");
		if ("mark" in current) {
			yield current.mark;
		} else {
			stack.push(current.right, current.left);
		}
	}
}
