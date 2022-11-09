/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    Delta,
    EmptyKey,
    FieldKey,
    IForestSubscription,
    ITreeCursorSynchronous,
    keyAsDetachedField,
    MapTree,
    moveToDetachedField,
    RepairDataStore,
    RevisionTag,
    SparseNode,
    TreeDestruction,
    UpPath,
    Value,
} from "../core";
import { unreachableCase } from "../util";
import { mapTreeFromCursor } from "./mapTreeCursor";

type RepairData = Map<RevisionTag, Value | MapTree>;
type RepairDataNode = SparseNode<RepairData | undefined>;

const repairDataFactory = (): RepairData => new Map();
const undefinedFactory = (): undefined => undefined;

export class ForestRepairDataStore implements RepairDataStore {
    private readonly root: RepairDataNode;

    public constructor(
        private readonly forestProvider: (revision: RevisionTag) => IForestSubscription,
    ) {
        this.root = new SparseNode<RepairData | undefined>(EmptyKey, 0, undefined, undefined);
    }

    public capture(destruction: TreeDestruction): void {
        const revision = destruction.revision;
        const forest = this.forestProvider(revision);
        const cursor = forest.allocateCursor();

        const visitFieldMarks = (fields: Delta.FieldMarks, parent: RepairDataNode): void => {
            for (const [key, field] of fields) {
                if (parent !== this.root) {
                    cursor.enterField(key);
                } else {
                    moveToDetachedField(forest, cursor, keyAsDetachedField(key));
                }
                visitField(field, parent, key);
                if (parent !== this.root) {
                    cursor.exitField();
                }
            }
        };

        function visitField(delta: Delta.MarkList, parent: RepairDataNode, key: FieldKey): void {
            let index = 0;
            for (const mark of delta) {
                if (typeof mark === "number") {
                    // Untouched nodes
                    index += mark;
                } else {
                    // Inline into `switch(mark.type)` once we upgrade to TS 4.7
                    const type = mark.type;
                    switch (type) {
                        case Delta.MarkType.ModifyAndMoveOut:
                        case Delta.MarkType.ModifyAndDelete: {
                            const child = parent.getOrCreateChild(key, index, repairDataFactory);
                            visitModify(mark, child);
                            onDelete(parent, key, index, 1);
                            index += 1;
                            break;
                        }
                        case Delta.MarkType.MoveOut:
                        case Delta.MarkType.Delete: {
                            onDelete(parent, key, index, mark.count);
                            index += mark.count;
                            break;
                        }
                        case Delta.MarkType.Modify: {
                            cursor.enterNode(index);
                            const child = parent.getOrCreateChild(key, index, undefinedFactory);
                            visitModify(mark, child);
                            cursor.exitNode();
                            index += 1;
                            break;
                        }
                        case Delta.MarkType.Insert:
                        case Delta.MarkType.InsertAndModify:
                        case Delta.MarkType.MoveIn:
                        case Delta.MarkType.MoveInAndModify:
                            break;
                        default:
                            unreachableCase(type);
                    }
                }
            }
        }

        function visitModify(modify: ModifyLike, node: RepairDataNode): void {
            // Note that the `in` operator return true for properties that are present on the object even if they
            // are set to `undefined. This is leveraged here to represent the fact that the value should be set to
            // `undefined` as opposed to leaving the value untouched.
            if ("setValue" in modify) {
                if (node.data === undefined) {
                    node.data = repairDataFactory();
                }
                const value = cursor.value;
                node.data.set(revision, value);
            }
            if (modify.fields !== undefined) {
                visitFieldMarks(modify.fields, node);
            }
        }

        function onDelete(
            parent: RepairDataNode,
            key: FieldKey,
            startIndex: number,
            count: number,
        ): void {
            for (let i = 0; i < count; ++i) {
                const fork = cursor.fork();
                const index = startIndex + i;
                fork.enterNode(index);
                const nodeData = mapTreeFromCursor(fork);
                fork.free();
                const child = parent.getOrCreateChild(key, index, repairDataFactory);
                if (child.data === undefined) {
                    child.data = repairDataFactory();
                }
                child.data.set(revision, nodeData);
            }
        }

        visitFieldMarks(destruction.changes, this.root);
        cursor.free();
    }

    public getNodes(
        revision: RevisionTag,
        path: UpPath,
        index: number,
        count: number,
    ): ITreeCursorSynchronous[] {
        throw new Error("Method not implemented.");
    }

    public getValue(revision: RevisionTag, path: UpPath, index: number): Value {
        throw new Error("Method not implemented.");
    }
}

interface ModifyLike {
    setValue?: Value;
    fields?: Delta.FieldMarks;
}
