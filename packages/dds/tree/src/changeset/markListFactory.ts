/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Transposed as T } from "./format";
import { isAttachGroup, isEqualGaps } from "./utils";

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
        if (this.offset === 0 && prev !== undefined && typeof prev === "object") {
            if (isAttachGroup(prev)) {
                if (isAttachGroup(mark)) {
                    const lastLeft = prev[prev.length - 1];
                    const firstRight = mark[0];
                    if (
                        lastLeft !== undefined
                        && firstRight !== undefined
                        && lastLeft.type === firstRight.type
                        && lastLeft.id === firstRight.id
                        && lastLeft.id === firstRight.id
                    ) {
                        const type = lastLeft.type;
                        switch (type) {
                            case "Insert":
                            case "MoveIn": {
                                const firstRightAttach = firstRight as T.Insert | T.MoveIn;
                                if (
                                    lastLeft.heed === firstRightAttach.heed
                                    && lastLeft.tiebreak === firstRightAttach.tiebreak
                                    && lastLeft.src?.id === firstRightAttach.src?.id
                                    && lastLeft.src?.change === firstRightAttach.src?.change
                                    && lastLeft.scorch?.id === firstRightAttach.scorch?.id
                                    && lastLeft.scorch?.change === firstRightAttach.scorch?.change
                                ) {
                                    if (lastLeft.type === "Insert") {
                                        const firstRightInsert = firstRight as T.Insert;
                                        lastLeft.content.push(...firstRightInsert.content);
                                    } else {
                                        const firstRightMoveIn = firstRight as T.MoveIn;
                                        lastLeft.count += firstRightMoveIn.count;
                                    }
                                    prev.push(...mark.slice(1));
                                    return;
                                }
                                break;
                            }
                            default: break;
                        }
                    }
                    prev.push(...mark);
                    return;
                }
            } else if (
                !isAttachGroup(mark)
                && prev.type === mark.type
            ) {
                // Neither are attach groups
                const type = mark.type;
                switch (type) {
                    case "Delete":
                    case "MoveOut": {
                        const prevDel = prev as T.Detach;
                        if (
                            mark.id === prevDel.id
                            && mark.tomb === prevDel.tomb
                            && isEqualGaps(mark.gaps, prevDel.gaps)
                        ) {
                            prevDel.count += mark.count;
                            return;
                        }
                        break;
                    }
                    case "Revive":
                    case "Return": {
                        const prevRe = prev as T.Reattach;
                        if (
                            mark.id === prevRe.id
                            && mark.tomb === prevRe.tomb
                        ) {
                            prevRe.count += mark.count;
                            return;
                        }
                        break;
                    }
                    case "Gap": {
                        const prevGap = prev as T.GapEffectSegment;
                        if (
                            mark.tomb === prevGap.tomb
                            && isEqualGaps(mark.stack, prevGap.stack)
                        ) {
                            prevGap.count += mark.count;
                            return;
                        }
                        break;
                    }
                    case "Tomb": {
                        const prevTomb = prev as T.Tomb;
                        if (mark.change === prevTomb.change) {
                            prevTomb.count += mark.count;
                            return;
                        }
                        break;
                    }
                    default: break;
                }
            }
        }
        this.list.push(mark);
    }
}
