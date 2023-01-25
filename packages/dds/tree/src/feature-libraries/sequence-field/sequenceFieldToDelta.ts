/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { unreachableCase } from "@fluidframework/common-utils";
import { brandOpaque, fail, Mutable, OffsetListFactory } from "../../util";
import { Delta } from "../../core";
import { singleTextCursor } from "../treeTextCursor";
import { NodeReviver } from "../modular-schema";
import { MarkList } from "./format";
import { getInputLength, getOutputLength, isSkipMark } from "./utils";

export type ToDelta<TNodeChange> = (
    child: TNodeChange,
    index: number | undefined,
) => Delta.NodeChanges;

const ERR_NO_REVISION_ON_REVIVE =
    "Unable to get convert revive mark to delta due to missing revision tag";

export function sequenceFieldToDelta<TNodeChange>(
    marks: MarkList<TNodeChange>,
    deltaFromChild: ToDelta<TNodeChange>,
    reviver: NodeReviver,
): Delta.FieldChanges {
    const markList = new OffsetListFactory<Delta.Mark>();
    const modList: Delta.NestedChange[] = [];
    let inputIndex = 0;
    let outputIndex = 0;
    for (const mark of marks) {
        if (isSkipMark(mark)) {
            markList.pushOffset(mark);
        } else {
            // Inline into `switch(mark.type)` once we upgrade to TS 4.7
            const type = mark.type;
            switch (type) {
                case "Insert": {
                    const insertMark: Delta.Mark = {
                        type: Delta.MarkType.Insert,
                        content: mark.content.map(singleTextCursor),
                    };
                    markList.pushContent(insertMark);
                    if (mark.changes !== undefined) {
                        modList.push([
                            { context: Delta.Context.Output, index: outputIndex },
                            deltaFromChild(mark.changes, undefined),
                        ]);
                    }
                    break;
                }
                case "MoveIn":
                case "ReturnTo": {
                    const moveMark: Delta.MoveIn = {
                        type: Delta.MarkType.MoveIn,
                        count: mark.count,
                        moveId: brandOpaque<Delta.MoveId>(mark.id),
                    };
                    markList.pushContent(moveMark);
                    break;
                }
                case "Modify": {
                    modList.push([
                        { context: Delta.Context.Input, index: inputIndex },
                        deltaFromChild(mark.changes, inputIndex),
                    ]);
                    break;
                }
                case "Delete": {
                    const deleteMark: Delta.Delete = {
                        type: Delta.MarkType.Delete,
                        count: mark.count,
                    };
                    markList.pushContent(deleteMark);
                    if (mark.changes !== undefined) {
                        modList.push([
                            { context: Delta.Context.Input, index: inputIndex },
                            deltaFromChild(mark.changes, inputIndex),
                        ]);
                    }
                    break;
                }
                case "MoveOut":
                case "ReturnFrom": {
                    const moveMark: Delta.MoveOut = {
                        type: Delta.MarkType.MoveOut,
                        moveId: brandOpaque<Delta.MoveId>(mark.id),
                        count: mark.count,
                    };
                    markList.pushContent(moveMark);
                    if (mark.changes !== undefined) {
                        modList.push([
                            { context: Delta.Context.Input, index: inputIndex },
                            deltaFromChild(mark.changes, inputIndex),
                        ]);
                    }
                    break;
                }
                case "Revive": {
                    if (mark.conflictsWith === undefined) {
                        const insertMark: Delta.Insert = {
                            type: Delta.MarkType.Insert,
                            content: reviver(
                                mark.detachedBy ??
                                    mark.lastDetachedBy ??
                                    fail(ERR_NO_REVISION_ON_REVIVE),
                                mark.detachIndex,
                                mark.count,
                            ),
                        };
                        markList.pushContent(insertMark);
                    } else if (mark.lastDetachedBy === undefined) {
                        markList.pushOffset(mark.count);
                    }
                    if (mark.changes !== undefined) {
                        modList.push([
                            { context: Delta.Context.Output, index: outputIndex },
                            deltaFromChild(mark.changes, outputIndex),
                        ]);
                    }
                    break;
                }
                default:
                    unreachableCase(type);
            }
        }
        outputIndex += getOutputLength(mark);
        inputIndex += getInputLength(mark);
    }
    const fieldChanges: Mutable<Delta.FieldChanges> = {};
    if (markList.list.length) {
        fieldChanges.siblingChanges = markList.list;
    }
    if (modList.length) {
        fieldChanges.nestedChanges = modList;
    }
    return fieldChanges;
}
