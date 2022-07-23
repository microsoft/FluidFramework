/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ProgressiveEditBuilder } from "../../change-family";
import { Transposed as T } from "../../changeset";
import { ITreeCursor } from "../../forest";
import { AnchorSet, UpPath, Value, Delta, getDepth } from "../../tree";
import { fail } from "../../util";
import { placeholderTreeFromCursor } from "../treeTextCursor";
import { sequenceChangeFamily } from "./sequenceChangeFamily";
import { SequenceChangeset } from "./sequenceChangeset";

export class SequenceEditBuilder extends ProgressiveEditBuilder<SequenceChangeset> {
    private opId: number = 0;

    constructor(
        deltaReceiver: (delta: Delta.Root) => void,
        anchorSet: AnchorSet,
    ) {
        super(sequenceChangeFamily, deltaReceiver, anchorSet);
    }

    public setValue(node: NodePath, value: Value) {
        const modify: T.Modify = { type: "Modify", value: { type: "Set", value } };
        this.applyAtPath(modify, node);
    }

    public insert(place: PlacePath, cursor: ITreeCursor) {
        const id = this.opId++;
        const content = placeholderTreeFromCursor(cursor);
        const insert: T.Insert = { type: "Insert", id, content: [content] };
        this.applyAtPath([insert], place);
    }

    public delete(place: PlacePath, count: number) {
        const id = this.opId++;
        const mark: T.Detach = { type: "Delete", id, count };
        this.applyAtPath(mark, place);
    }

    public move(source: PlacePath, count: number, destination: PlacePath) {
        const id = this.opId++;
        const moveOut: T.Detach = { type: "MoveOut", id, count };
        const moveIn: T.AttachGroup = [{ type: "MoveIn", id, count }];
        // const o = nest(moveOut, source);
        // const i = nest(moveIn, destination);
        let a: NestBranch = {
            marks: toFieldMarks(moveOut, source),
            path: source,
        };
        let b: NestBranch = {
            marks: toFieldMarks(moveIn, destination),
            path: destination,
        };
        let depthDiff = getDepth(source) - getDepth(destination);
        // Ensure that a represents the deeper mark
        if (depthDiff < 0) {
            [a, b] = [b, a];
            depthDiff = -depthDiff;
        }
        // Nest the deeper mark so that they are both at the same depth
        a = nestN(a.marks, a.path, depthDiff);
        // Nest both marks one level at a time until they reach the same parent
        while (a.path !== b.path) {
            a = nestN(a.marks, a.path, 1);
            b = nestN(b.marks, b.path, 1);
        }
        if (a.path === undefined) {
            this.applyChange({ marks: { ...a.marks, ...b.marks } });
        } else {
            const aPath = a.path;
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            const bPath = b.path!;
            const keyA = aPath.parentField() as string;
            const keyB = bPath.parentField() as string;
            let indexA = aPath.parentIndex();
            let indexB = bPath.parentIndex();
            if (keyA !== keyB) {
                const modify: T.Modify = {
                    type: "Modify",
                    fields: { ...a.marks, ...b.marks },
                };
                this.applyAtPath(modify, aPath);
            } else {
                if (indexA === indexB) {
                    fail(ERR_UP_PATH_NOT_VALID);
                }
                if (indexA > indexB) {
                    [a, indexA, b, indexB] = [b, indexB, a, indexA];
                }
                const gap = indexB - indexA - 1;
                let marks;
                if (indexA === 0) {
                    if (gap === 0) {
                        marks = [a.marks[keyA][0], b.marks[keyB][1]];
                    } else {
                        marks = [a.marks[keyA][0], gap, b.marks[keyB][1]];
                    }
                } else {
                    if (gap === 0) {
                        marks = [indexA, a.marks[keyA][1], b.marks[keyB][1]];
                    } else {
                        marks = [indexA, a.marks[keyA][1], gap, b.marks[keyB][1]];
                    }
                }
                const modify: T.Modify = {
                    type: "Modify",
                    fields: { [keyA]: marks },
                };
                this.applyAtPath(modify, aPath);
            }
        }
    }

    private applyAtPath(mark: T.Mark, path: UpPath) {
        this.applyChange({ marks: nest(mark, path) });
    }
}

interface NestBranch {
    marks: T.FieldMarks;
    path: UpPath | undefined;
}

function toFieldMarks(mark: T.Mark, node: UpPath): T.FieldMarks {
    const key = node.parentField();
    const index = node.parentIndex();
    return {
        [key as string]: index === 0 ? [mark] : [index, mark],
    };
}

function nestN(mark: T.FieldMarks, node: UpPath | undefined, depth: number) {
    let currentNode: UpPath | undefined = node;
    let out: T.FieldMarks = mark;
    let currentDepth = 0;
    while (currentNode !== undefined && currentDepth < depth) {
        out = toFieldMarks({ type: "Modify", fields: out }, currentNode);
        currentDepth += 1;
        currentNode = currentNode.parent();
    }
    return { marks: out, path: currentNode };
}

function nest(mark: T.Mark, node: UpPath): T.FieldMarks {
    let currentNode: UpPath | undefined = node;
    let out: T.FieldMarks;
    let currMark = mark;
    do {
        const key = currentNode.parentField();
        const index = currentNode.parentIndex();
        out = {
            [key as string]: index === 0 ? [currMark] : [index, currMark],
        };
        currentNode = currentNode.parent();
        currMark = {
            type: "Modify",
            fields: out,
        };
    } while (currentNode !== undefined);
    return out;
}

type NodePath = UpPath;
type PlacePath = UpPath;

const ERR_UP_PATH_NOT_VALID
    = "If the two paths have the same key and the same index then they should have shared an UpPath earlier";
