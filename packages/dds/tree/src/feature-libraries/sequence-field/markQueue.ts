/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";

import { getFirstMoveEffectLength, type MoveEffectTable } from "./moveEffectTable.js";
import type { Mark } from "./types.js";
import { splitMark } from "./utils.js";

export class MarkQueueBase {
	private readonly stack: Mark[] = [];
	private index = 0;

	public constructor(private readonly list: readonly Mark[]) {
		this.list = list;
	}

	public isEmpty(): boolean {
		return this.peek() === undefined;
	}

	public dequeue(): Mark {
		const output = this.tryDequeue();
		assert(output !== undefined, 0x4e2 /* Unexpected end of mark queue */);
		return output;
	}

	public tryDequeue(): Mark | undefined {
		const mark = this.stack.length > 0 ? this.stack.pop() : this.list[this.index++];
		if (mark === undefined) {
			return undefined;
		}

		const splitLength = this.getLengthForSplit(mark);
		if (splitLength < mark.count) {
			const [part1, part2] = splitMark(mark, splitLength);
			this.stack.push(part2);
			return part1;
		}

		return mark;
	}

	/**
	 * Dequeues the first `length` sized portion of the next mark,
	 * or the entire next mark if `length` is longer than the mark's length.
	 * @param length - The length to dequeue, measured in the input context.
	 */
	public dequeueUpTo(length: number): Mark {
		const mark = this.dequeue();
		if (mark.count <= length) {
			return mark;
		}

		const [mark1, mark2] = splitMark(mark, length);
		this.stack.push(mark2);
		return mark1;
	}

	public peek(): Mark | undefined {
		const mark = this.tryDequeue();
		if (mark !== undefined) {
			this.stack.push(mark);
		}
		return mark;
	}

	protected getLengthForSplit(mark: Mark): number {
		return mark.count;
	}
}

export class MarkQueue extends MarkQueueBase {
	public constructor(
		list: readonly Mark[],
		private readonly moveEffects: MoveEffectTable,
	) {
		super(list);
	}

	protected override getLengthForSplit(mark: Mark): number {
		return getFirstMoveEffectLength(mark, mark.count, this.moveEffects);
	}
}
