/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Skip, Transposed as T } from "./format";
import { isObjMark, isSkipMark, tryExtendMark } from "./utils";

/**
 * Helper class for constructing an offset list of marks that...
 *
 * - Does not insert offsets if there is no content after them
 *
 * - Does not insert 0-sized offsets
 *
 * - Merges runs of offsets together
 *
 * - Merges marks together
 */
export class MarkListFactory {
    private offset = 0;
    public readonly list: T.MarkList = [];

    public push(...marks: T.Mark[]): void {
        for (const item of marks) {
            if (isSkipMark(item)) {
                this.pushOffset(item);
            } else {
                this.pushContent(item);
            }
        }
    }

    public pushOffset(offset: Skip): void {
        this.offset += offset;
    }

    public pushContent(mark: T.ObjectMark): void {
        if (this.offset > 0) {
            this.list.push(this.offset);
            this.offset = 0;
        }
        const prev = this.list[this.list.length - 1];
        if (isObjMark(prev) && prev.type === mark.type) {
            if (tryExtendMark(prev, mark)) {
                return;
            }
        }
        this.list.push(mark);
    }
}
