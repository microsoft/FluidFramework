/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils";
import { RevisionTag, TaggedChange } from "../../core";
import { IdAllocator } from "../../util";
import { Mark } from "./types";
import { applyMoveEffectsToMark, MoveEffectTable } from "./moveEffectTable";
import { splitMark } from "./utils";

export class MarkQueue<T> {
	private readonly stack: Mark<T>[] = [];
	private index = 0;

	public constructor(
		private readonly list: readonly Mark<T>[],
		public readonly revision: RevisionTag | undefined,
		private readonly moveEffects: MoveEffectTable<T>,
		private readonly consumeEffects: boolean,
		private readonly genId: IdAllocator,
		private readonly composeChanges?: (a: T | undefined, b: TaggedChange<T>) => T | undefined,
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
		if (this.stack.length > 0) {
			return this.stack.pop();
		} else if (this.index < this.list.length) {
			const mark = this.list[this.index++];
			if (mark === undefined) {
				return undefined;
			}

			const splitMarks = applyMoveEffectsToMark(
				mark,
				this.revision,
				this.moveEffects,
				this.consumeEffects,
				this.composeChanges,
			);

			if (splitMarks.length === 0) {
				return undefined;
			}

			const result = splitMarks[0];
			for (let i = splitMarks.length - 1; i > 0; i--) {
				this.stack.push(splitMarks[i]);
			}
			return result;
		}
	}

	/**
	 * Dequeues the first `length` sized portion of the next mark.
	 * The caller must verify that the next mark (as returned by peek) is longer than this length.
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
