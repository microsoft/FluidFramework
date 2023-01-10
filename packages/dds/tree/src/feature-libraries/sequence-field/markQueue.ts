/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/common-utils";
import { RevisionTag } from "../../core";
import { IdAllocator } from "../modular-schema";
import { InputSpanningMark, Mark } from "./format";
import {
    applyMoveEffectsToMark,
    MoveEffectTable,
    splitMarkOnInput,
    splitMarkOnOutput,
} from "./moveEffectTable";
import { isBlockedReattach, isInputSpanningMark, isOutputSpanningMark } from "./utils";

export class MarkQueue<T> {
    private readonly stack: Mark<T>[] = [];
    private index = 0;

    public constructor(
        private readonly list: readonly Mark<T>[],
        public readonly revision: RevisionTag | undefined,
        private readonly moveEffects: MoveEffectTable<T>,
        private readonly genId: IdAllocator,
        private readonly reassignMoveIds: boolean = false,
        private readonly updatePairedMarkStatus: boolean = false,
        private readonly composeChanges?: (a: T | undefined, b: T | undefined) => T | undefined,
    ) {
        this.list = list;
    }

    public isEmpty(): boolean {
        return this.peek() === undefined;
    }

    public dequeue(): Mark<T> | undefined {
        let reassignMoveIds = this.reassignMoveIds;
        let mark: Mark<T> | undefined;
        if (this.stack.length > 0) {
            mark = this.stack.pop();
            reassignMoveIds = false;
        } else if (this.index < this.list.length) {
            mark = this.list[this.index++];
        }

        if (mark === undefined) {
            return undefined;
        }

        const splitMarks = applyMoveEffectsToMark(
            mark,
            this.revision,
            this.moveEffects,
            this.genId,
            reassignMoveIds,
            this.updatePairedMarkStatus,
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

    /**
     * Dequeues the first `length` sized portion of the next mark.
     * The caller must verify that the next mark (as returned by peek) is longer than this length.
     * @param length - The length to dequeue, measured in the input context.
     */
    public dequeueInput(length: number): InputSpanningMark<T> {
        const mark = this.dequeue();
        assert(mark !== undefined, "Should only dequeue if not empty");
        assert(isInputSpanningMark(mark), "Can only split sized marks on input");
        const [mark1, mark2] = splitMarkOnInput(mark, length, this.genId, this.moveEffects);
        this.stack.push(mark2);
        return mark1;
    }

    /**
     * Dequeues the first `length` sized portion of the next mark.
     * The caller must verify that the next mark (as returned by peek) is longer than this length.
     * @param length - The length to dequeue, measured in the output context.
     */
    public dequeueOutput(length: number, includeBlockedCells: boolean = false): Mark<T> {
        const mark = this.dequeue();
        assert(mark !== undefined, "Should only dequeue if not empty");
        assert(
            isOutputSpanningMark(mark) || (includeBlockedCells && isBlockedReattach(mark)),
            "Should only dequeue output if the next mark has output length > 0",
        );
        const [mark1, mark2] = splitMarkOnOutput(mark, length, this.genId, this.moveEffects);
        this.stack.push(mark2);
        return mark1;
    }

    public peek(): Mark<T> | undefined {
        const mark = this.dequeue();
        if (mark !== undefined) {
            this.stack.push(mark);
        }
        return mark;
    }
}
