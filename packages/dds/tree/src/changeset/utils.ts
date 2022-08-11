/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { unreachableCase } from "@fluidframework/common-utils";
import { fail } from "../util";
import { Transposed as T } from "./format";

export function isAttachGroup(mark: T.Mark): mark is T.AttachGroup {
    return Array.isArray(mark);
}

export function isReattach(mark: T.Mark): mark is T.AttachGroup {
    return typeof mark === "object" && "type" in mark && (mark.type === "Revive" || mark.type === "Return");
}

export function getAttachLength(attach: T.Attach): number {
    const type = attach.type;
    switch (type) {
        case "Bounce":
        case "Intake":
            return 0;
        case "MInsert":
        case "MMoveIn":
            return 1;
        case "Insert":
            return attach.content.length;
        case "MoveIn":
            return attach.count;
        default: unreachableCase(type);
    }
}

export function getMarkLength(mark: T.Mark): number {
    if (typeof mark === "number") {
        return mark;
    }
    if (isAttachGroup(mark)) {
        return mark.reduce((prev, attach) => prev + getAttachLength(attach), 0);
    }
    return "count" in mark ? mark.count : 1;
}

export function splitMark<TMark extends T.Mark>(mark: TMark, length: number): [TMark, TMark] {
    const markLength = getMarkLength(mark);
    const remainder = markLength - length;
    if (length < 1 || markLength <= length) {
        fail(`Unable to split mark of length ${markLength} into marks of lengths ${length} and ${remainder}`);
    }
    if (typeof mark === "number") {
        return [length, remainder] as [TMark, TMark];
    }
    if (isAttachGroup(mark)) {
        return splitAttachGroup(mark, length) as [TMark, TMark];
    }
    // The linter seems to think this cast is not needed, which seems correct, but the compiled disagrees.
    const markObj = mark as T.ObjectMark;
    if ("count" in mark) {
        return [{ ...markObj, count: length }, { ...markObj, count: remainder }] as [TMark, TMark];
    }
    fail("Unable to split mark");
}

function splitAttachGroup<TAttach extends T.Attach>(mark: TAttach[], length: number): [TAttach[], TAttach[]] {
    const groupA: TAttach[] = [];
    const groupB: TAttach[] = [...mark];
    let left = length;
    while (left > 0) {
        const attach = groupB.shift();
        if (attach === undefined) {
            fail("Discrepancy between getMarkLength and splitMark");
        }
        const len = getAttachLength(attach);
        if (len <= left) {
            groupA.push(attach);
            left -= len;
        } else {
            const pair = splitAttachMark(attach, left);
            groupA.push(pair[0]);
            groupB.unshift(pair[1]);
            left -= left;
        }
    }
    return [groupA, groupB];
}

function splitAttachMark<TAttach extends T.Attach>(attach: TAttach, length: number): [TAttach, TAttach] {
    const markLength = getAttachLength(attach);
    const remainder = markLength - length;
    if (length < 1 || markLength <= length) {
        fail(`Unable to split mark of length ${markLength} into marks of lengths ${length} and ${remainder}`);
    }
    const type = attach.type;
    switch (type) {
        case "Bounce":
        case "Intake":
        case "MInsert":
        case "MMoveIn":
            fail("Unable to split mark");
        case "Insert":
            return [
                { ...attach, content: attach.content.slice(0, length) },
                { ...attach, content: attach.content.slice(length) },
            ];
        case "MoveIn":
            return [
                { ...attach, count: length },
                { ...attach, count: remainder },
            ];
        default: unreachableCase(type);
    }
}

export function isDetachMark(mark: T.Mark | undefined): mark is T.Detach | T.ModifyDetach {
    if (typeof mark === "object" && "type" in mark) {
        const type = mark.type;
        return type === "Delete" || type === "MDelete" || type === "MoveOut" || type === "MMoveOut";
    }
    return false;
}
