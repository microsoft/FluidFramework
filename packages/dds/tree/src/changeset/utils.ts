/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { fail } from "../util";
import { Transposed as T } from "./format";

export function isAttachGroup(mark: T.Mark): mark is T.AttachGroup {
    return Array.isArray(mark);
}

export function getMarkInputLength(mark: T.Mark): number {
    if (typeof mark === "number") {
        return mark;
    }
    if (isAttachGroup(mark)) {
        return 0;
    }
    return "count" in mark ? mark.count : 1;
}

export function splitMark(mark: T.Mark, length: number): [T.Mark, T.Mark] {
    const markLength = getMarkInputLength(mark);
    const remainder = markLength - length;
    if (length < 1 || markLength <= length) {
        fail(`Unable to split mark of length ${markLength} into marks of lengths ${length} and ${remainder}`);
    }
    if (typeof mark === "number") {
        return [length, remainder];
    }
    if ("count" in mark) {
        return [{ ...mark, count: length }, { ...mark, count: remainder }];
    }
    fail("Unable to split mark");
}
