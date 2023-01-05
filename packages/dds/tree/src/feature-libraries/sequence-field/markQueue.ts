/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/common-utils";
import { RevisionTag } from "../../core";
import { IdAllocator } from "../modular-schema";
import { Mark, SizedMark } from "./format";
import {
    applyMoveEffectsToMark,
    MoveEffectTable,
    splitMarkOnInput,
    splitMarkOnOutput,
} from "./moveEffectTable";
import { getInputLength, getOutputLength, isSizedMark } from "./utils";

export class MarkQueue<T> {
    private readonly stack: Mark<T>[] = [];
    private index = 0;

    public constructor(
        private readonly list: readonly Mark<T>[],
        public readonly revision: RevisionTag | undefined,
        private readonly moveEffects: MoveEffectTable<T>,
        private readonly genId: IdAllocator,
        private readonly reassignMoveIds: boolean = false,
        private readonly composeChanges?: (a: T | undefined, b: T | undefined) => T | undefined,
    ) {
        this.list = list;
    }

    public isEmpty(): boolean {
        return this.peek() === undefined;
    }

    public takeInput(length: number): SizedMark<T> | undefined {
        const mark = this.pop();
        if (mark === undefined) {
            return undefined;
        }

        assert(isSizedMark(mark), "Can only split sized marks on input");
        if (getInputLength(mark) <= length) {
            return mark;
        }

        const [mark1, mark2] = splitMarkOnInput(mark, length, this.genId, this.moveEffects);
        this.stack.push(mark2);
        return mark1;
    }

    public takeOutput(length: number): Mark<T> | undefined {
        const mark = this.pop();
        if (mark === undefined) {
            return undefined;
        }

        if (getOutputLength(mark) <= length) {
            return mark;
        }

        const [mark1, mark2] = splitMarkOnOutput(mark, length, this.genId, this.moveEffects);
        this.stack.push(mark2);
        return mark1;
    }

    public peek(): Mark<T> | undefined {
        const mark = this.pop();
        if (mark !== undefined) {
            this.stack.push(mark);
        }
        return mark;
    }

    public pop(): Mark<T> | undefined {
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
