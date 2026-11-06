/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";

import type { MarkSegmentTree, MarkContext } from "./markSegmentTree.js";
import { getFirstMoveEffectLength, type MoveEffectTable } from "./moveEffectTable.js";
import type { Mark } from "./types.js";
import { splitMark } from "./utils.js";

/**
 * An array cursor with a segment-tree index for jumping over reusable runs.
 * Partially consumed marks use the ordinary dequeue path.
 */
export class SegmentMarkQueue {
	private index = 0;
	private residue: Mark | undefined;

	public constructor(
		private readonly tree: MarkSegmentTree,
		private readonly moveEffects: MoveEffectTable,
	) {}

	public isEmpty(): boolean {
		return this.residue === undefined && this.index === this.tree.marks.length;
	}

	public peek(): Mark | undefined {
		const mark = this.residue ?? this.tree.marks[this.index];
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
			mark = this.tree.marks[this.index];
			assert(mark !== undefined, "Unexpected end of segment mark queue");
			this.index++;
		}
		this.residue = undefined;
		const count = Math.min(
			length,
			getFirstMoveEffectLength(mark, mark.count, this.moveEffects),
		);
		if (count < mark.count) {
			const [head, tail] = splitMark(mark, count);
			this.residue = tail;
			return head;
		}
		return mark;
	}

	/**
	 * Jumps to the tree's exclusive end index and returns the intervening array entries.
	 * Copying those entries is linear; locating the boundary does not scan their marks.
	 */
	public tryDequeueReusable(
		noop: Mark | undefined,
		context: MarkContext,
	): readonly Mark[] | undefined {
		if (this.residue !== undefined) {
			return undefined;
		}
		const end = this.tree.findReusableEnd(this.index, noop, context);
		if (end === this.index) {
			return undefined;
		}
		const marks = this.tree.marks.slice(this.index, end);
		this.index = end;
		return marks;
	}
}
