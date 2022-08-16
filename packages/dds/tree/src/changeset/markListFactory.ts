/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Transposed as T } from "./format";
import { extendAttachGroup, isAttachGroup, isObjMark, tryExtendMark } from "./utils";

/**
 * Helper class for constructing an offset list of marks that...
 *  - Does not insert offsets if there is no content after them
 *  - Does not insert 0-sized offsets
 *  - Merges runs of offsets together
 *  - Merges marks together
 */
export class MarkListFactory {
    private offset = 0;
    public readonly list: T.MarkList = [];

    public push(...offsetOrContent: (number | T.Mark)[]): void {
        for (const item of offsetOrContent) {
            if (typeof item === "number") {
                this.pushOffset(item);
            } else {
                this.pushContent(item);
            }
        }
    }

    public pushOffset(offset: number): void {
        this.offset += offset;
    }

    public pushContent(mark: T.ObjectMark | T.AttachGroup): void {
        if (this.offset > 0) {
            this.list.push(this.offset);
            this.offset = 0;
        }
        const prev = this.list[this.list.length - 1];
        if (this.offset === 0 && isObjMark(prev)) {
            if (isAttachGroup(prev)) {
                if (isAttachGroup(mark)) {
                    extendAttachGroup(prev, mark);
                    return;
                }
            } else if (
                !isAttachGroup(mark)
                && prev.type === mark.type
            ) {
                // Neither are attach groups
                if (tryExtendMark(prev, mark)) {
                    return;
                }
            }
        }
        this.list.push(mark);
    }
}
