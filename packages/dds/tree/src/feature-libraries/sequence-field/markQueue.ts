/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, oob } from "@fluidframework/core-utils/internal";
import { type MoveEffectTable, splitMarkForMoveEffects } from "./moveEffectTable.js";
import type { Mark } from "./types.js";
import { splitMark } from "./utils.js";

export class MarkQueue {
	private readonly stack: Mark[] = [];
	private index = 0;

	public constructor(
		private readonly list: readonly Mark[],
		private readonly moveEffects: MoveEffectTable,
	) {
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

		const splitMarks = splitMarkForMoveEffects(mark, this.moveEffects);
		for (let i = splitMarks.length - 1; i > 0; i--) {
			this.stack.push(splitMarks[i] ?? oob());
		}
		return splitMarks[0];
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
}
