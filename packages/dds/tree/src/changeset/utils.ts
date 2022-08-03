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

export function splitMark<TMark extends T.SizedMark>(mark: TMark, length: number): [TMark, TMark] {
    const markLength = getMarkInputLength(mark);
    const remainder = markLength - length;
    if (length < 1 || markLength <= length) {
        fail(`Unable to split mark of length ${markLength} into marks of lengths ${length} and ${remainder}`);
    }
    if (typeof mark === "number") {
        return [length, remainder] as [TMark, TMark];
    }
    // The linter seems to think this cast is not needed, which seems correct, but the compiled disagrees.
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
    const markObj = mark as T.ObjectMark;
    if ("count" in mark) {
        return [{ ...markObj, count: length }, { ...markObj, count: remainder }] as [TMark, TMark];
    }
    fail("Unable to split mark");
}
