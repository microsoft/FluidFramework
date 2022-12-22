/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ChangesetLocalId, SequenceField as SF } from "../../../feature-libraries";
import { Delta, TaggedChange } from "../../../core";
import { TestChange } from "../../testChange";
import { assertMarkListEqual, deepFreeze, fakeRepair } from "../../utils";
import { makeAnonChange, RevisionTag, tagChange } from "../../../rebase";
import { brand, clone, fail } from "../../../util";
import { TestChangeset } from "./testEdits";

export function composeAnonChanges(changes: TestChangeset[]): TestChangeset {
    const taggedChanges = changes.map(makeAnonChange);
    return SF.sequenceFieldChangeRebaser.compose(
        taggedChanges,
        TestChange.compose,
        TestChange.newIdAllocator(getMaxIdTagged(taggedChanges)),
    );
}

export function rebaseTagged(
    change: TaggedChange<TestChangeset>,
    ...base: TaggedChange<TestChangeset>[]
): TaggedChange<TestChangeset> {
    deepFreeze(change);
    deepFreeze(base);

    let currChange = change;
    for (const baseChange of base) {
        currChange = tagChange(
            SF.rebase(
                currChange.change,
                baseChange,
                TestChange.rebase,
                TestChange.newIdAllocator(getMaxId(currChange.change, baseChange.change)),
            ),
            change.revision,
        );
    }
    return currChange;
}

export function checkDeltaEquality(actual: TestChangeset, expected: TestChangeset) {
    assertMarkListEqual(toDelta(actual), toDelta(expected));
}

export function toDelta(change: TestChangeset): Delta.MarkList {
    return SF.sequenceFieldToDelta(change, TestChange.toDelta, fakeRepair);
}

export function getMaxId(...changes: SF.Changeset<unknown>[]): ChangesetLocalId | undefined {
    let max: ChangesetLocalId | undefined;
    for (const change of changes) {
        for (const mark of change) {
            if (SF.isMoveMark(mark)) {
                max = max === undefined ? mark.id : brand(Math.max(max, mark.id));
            }
        }
    }

    return max;
}

export function getMaxIdTagged(
    changes: TaggedChange<SF.Changeset<unknown>>[],
): ChangesetLocalId | undefined {
    return getMaxId(...changes.map((c) => c.change));
}

export function normalizeMoveIds(change: SF.Changeset<unknown>): void {
    let nextId = 0;
    const mappings = new Map<SF.MoveId, SF.MoveId>();
    for (const mark of change) {
        if (SF.isMoveMark(mark)) {
            let newId = mappings.get(mark.id);
            if (newId === undefined) {
                newId = brand(nextId++);
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                mappings.set(mark.id, newId!);
            }
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            mark.id = newId!;
        }
    }
}

interface DetachedNode {
    rev: RevisionTag;
    index: number;
}

/**
 * Keeps track of the different ways detached nodes may be referred to.
 * Allows updating changesets so they refer to a detached node by the details
 * of the last detach that affected them.
 */
export class DetachedNodeTracker {
    private nodes: Map<number, DetachedNode> = new Map();
    private readonly equivalences: { old: DetachedNode; new: DetachedNode }[] = [];

    public constructor() {}

    public apply(change: TaggedChange<SF.Changeset<unknown>>): void {
        let index = 0;
        for (const mark of change.change) {
            const inputLength: number = SF.getInputLength(mark);
            if (SF.isDetachMark(mark)) {
                const newNodes: Map<number, DetachedNode> = new Map();
                const after = index + inputLength;
                for (const [k, v] of this.nodes) {
                    if (k >= index) {
                        if (k >= after) {
                            newNodes.set(k - inputLength, v);
                        } else {
                            // The node is removed
                            this.equivalences.push({
                                old: v,
                                new: {
                                    rev:
                                        mark.revision ??
                                        change.revision ??
                                        fail("Unable to track detached nodes"),
                                    index: k,
                                },
                            });
                        }
                    } else {
                        newNodes.set(k, v);
                    }
                }
                this.nodes = newNodes;
            }
            if (SF.isActiveReattach(mark)) {
                const newNodes: Map<number, DetachedNode> = new Map();
                for (const [k, v] of this.nodes) {
                    if (k >= index) {
                        newNodes.set(k + inputLength, v);
                    } else {
                        newNodes.set(k, v);
                    }
                }
                for (let i = 0; i < mark.count; ++i) {
                    newNodes.set(index + i, {
                        rev: mark.detachedBy ?? fail("Unable to track detached nodes"),
                        index: mark.detachIndex + i,
                    });
                }
                this.nodes = newNodes;
            }
            index += inputLength;
        }
    }

    public update<T>(change: TaggedChange<SF.Changeset<T>>): TaggedChange<SF.Changeset<T>> {
        const moveEffects = SF.newMoveEffectTable<T>();
        const factory = new SF.MarkListFactory<T>(moveEffects);
        for (const mark of change.change) {
            const cloned = clone(mark);
            if (SF.isReattach(cloned)) {
                for (let i = 0; i < cloned.count; ++i) {
                    const atom = { ...cloned, count: 1, detachIndex: cloned.detachIndex + i };
                    for (const eq of this.equivalences) {
                        if (atom.detachedBy === eq.old.rev && atom.detachIndex === eq.old.index) {
                            atom.detachedBy = eq.new.rev;
                            atom.detachIndex = eq.new.index;
                        }
                    }
                    factory.push(atom);
                }
            } else {
                factory.push(cloned);
            }
        }
        return {
            ...change,
            change: factory.list,
        };
    }
}
