/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils";
import { RevisionTag } from "../../core/index.js";
import { Mark } from "./types.js";
import { splitMarkForMoveEffects, MoveEffectTable } from "./moveEffectTable.js";
import { splitMark } from "./utils.js";

export class MarkQueue<T> {
	private readonly stack: Mark<T>[] = [];
	private index = 0;

	public constructor(
		private readonly list: readonly Mark<T>[],
		public readonly revision: RevisionTag | undefined,
		private readonly moveEffects: MoveEffectTable<T>,
	) {
		this.list = list;
	}

	public isEmpty(): boolean {
		return this.peek() === undefined;
	}

	public dequeue(): Mark<T> {
		const output = this.tryDequeue();
		assert(output !== undefined, 0x4e2 /* Unexpected end of mark queue */);
		return output;
	}

	public tryDequeue(): Mark<T> | undefined {
		const mark = this.stack.length > 0 ? this.stack.pop() : this.list[this.index++];
		if (mark === undefined) {
			return undefined;
		}

		const splitMarks = splitMarkForMoveEffects(mark, this.revision, this.moveEffects);
		for (let i = splitMarks.length - 1; i > 0; i--) {
			this.stack.push(splitMarks[i]);
		}
		return splitMarks[0];
	}

	/**
	 * Dequeues the first `length` sized portion of the next mark,
	 * or the entire next mark if `length` is longer than the mark's length.
	 * @param length - The length to dequeue, measured in the input context.
	 */
	public dequeueUpTo(length: number): Mark<T> {
		const mark = this.dequeue();
		if (mark.count <= length) {
			return mark;
		}

		const [mark1, mark2] = splitMark(mark, length);
		this.stack.push(mark2);
		return mark1;
	}

	public peek(): Mark<T> | undefined {
		const mark = this.tryDequeue();
		if (mark !== undefined) {
			this.stack.push(mark);
		}
		return mark;
	}
}
