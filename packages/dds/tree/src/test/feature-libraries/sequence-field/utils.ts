/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/common-utils";
import {
    ChangesetLocalId,
    CrossFieldManager,
    CrossFieldTarget,
    IdAllocator,
    SequenceField as SF,
} from "../../../feature-libraries";
import { Delta, TaggedChange, makeAnonChange, tagChange, RevisionTag } from "../../../core";
import { TestChange } from "../../testChange";
import { assertMarkListEqual, deepFreeze, fakeRepair } from "../../utils";
import {
    brand,
    deleteFromNestedMap,
    fail,
    getOrAddInNestedMap,
    getOrDefaultInNestedMap,
    NestedMap,
    setInNestedMap,
    tryGetFromNestedMap,
} from "../../../util";
import { TestChangeset } from "./testEdits";

export function composeAnonChanges(changes: TestChangeset[]): TestChangeset {
    const taggedChanges = changes.map(makeAnonChange);
    return SF.sequenceFieldChangeRebaser.compose(
        taggedChanges,
        TestChange.compose,
        continuingAllocator(taggedChanges),
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
                idAllocatorFromMaxId(getMaxId(currChange.change, baseChange.change)),
            ),
            change.revision,
        );
    }
    return currChange;
}

type NestedSet<Key1, Key2> = NestedMap<Key1, Key2, boolean>;
type MoveQuerySet = NestedSet<RevisionTag | undefined, SF.MoveId>;

function addToNestedSet<Key1, Key2>(set: NestedSet<Key1, Key2>, key1: Key1, key2: Key2): void {
    setInNestedMap(set, key1, key2, true);
}

function nestedSetContains<Key1, Key2>(
    set: NestedSet<Key1, Key2>,
    key1: Key1,
    key2: Key2,
): boolean {
    return getOrDefaultInNestedMap(set, key1, key2, false);
}

interface CrossFieldTable {
    srcQueries: MoveQuerySet;
    dstQueries: MoveQuerySet;
    invalidated: boolean;
}

function newCrossFieldTable(): CrossFieldTable {
    return {
        srcQueries: new Map(),
        dstQueries: new Map(),
        invalidated: false,
    };
}

function newCrossFieldManager(table: CrossFieldTable): CrossFieldManager {
    const mapSrc: NestedMap<RevisionTag | undefined, SF.MoveId, unknown> = new Map();
    const mapDst: NestedMap<RevisionTag | undefined, SF.MoveId, unknown> = new Map();
    const getMap = (target: CrossFieldTarget) =>
        target === CrossFieldTarget.Source ? mapSrc : mapDst;

    const getQueries = (target: CrossFieldTarget) =>
        target === CrossFieldTarget.Source ? table.srcQueries : table.dstQueries;

    const manager: CrossFieldManager = {
        get: (target, revision, id) => {
            const result = tryGetFromNestedMap(getMap(target), revision, id);
            addToNestedSet(getQueries(target), revision, id);
            return result;
        },
        getOrCreate: (target, revision, id, defaultValue) => {
            getOrAddInNestedMap(getMap(target), revision, id, defaultValue);
            if (nestedSetContains(getQueries(target), revision, id)) {
                table.invalidated = true;
            }
        },
        consume: (target, revision, id) => deleteFromNestedMap(getMap(target), revision, id),
    };
    return manager;
}

export function invert(change: TaggedChange<TestChangeset>): TestChangeset {
    const table = newCrossFieldTable();
    let inverted = SF.invert(
        change,
        TestChange.invert,
        () => fail("Sequence fields should not generate IDs during invert"),
        newCrossFieldManager(table),
    );

    if (table.invalidated) {
        table.invalidated = false;
        table.srcQueries.clear();
        table.dstQueries.clear();
        inverted = SF.amendInvert(
            inverted,
            change.revision,
            TestChange.invert,
            () => fail("Sequence fields should not generate IDs during invert"),
            newCrossFieldManager(table),
        );
        assert(!table.invalidated, "Invert should not need more than one amend pass");
    }

    return inverted;
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

export function continuingAllocator(changes: TaggedChange<SF.Changeset<unknown>>[]): IdAllocator {
    return idAllocatorFromMaxId(getMaxIdTagged(changes));
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

export function idAllocatorFromMaxId(maxId: ChangesetLocalId | undefined = undefined): IdAllocator {
    let currId = maxId ?? -1;
    return () => {
        return brand(++currId);
    };
}
