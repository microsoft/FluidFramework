/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import {
    NodeChangeComposer,
    NodeChangeset,
    SequenceField as SF,
} from "../../../feature-libraries";
import { TreeSchemaIdentifier } from "../../../schema-stored";
import { brand } from "../../../util";
import { deepFreeze } from "../../utils";
import { cases } from "./cases";

const type: TreeSchemaIdentifier = brand("Node");
const tomb = "Dummy Changeset Tag";

function compose(changes: SF.Changeset[]): SF.Changeset {
    changes.forEach(deepFreeze);
    return SF.sequenceFieldChangeRebaser.compose(changes, childComposer);
}

const childComposer = (changes: NodeChangeset[]) => {
    if (changes.length === 0) {
        return {};
    }
    for (const change of changes) {
        assert.equal(change.fieldChanges, undefined);
        assert.notEqual(change.valueChange, undefined);
    }
    return changes[changes.length - 1];
};

describe("SequenceChangeFamily - Compose", () => {
    describe("associativity of triplets", () => {
        const entries = Object.entries(cases);
        for (const a of entries) {
            for (const b of entries) {
                for (const c of entries) {
                    it(`((${a[0]}, ${b[0]}), ${c[0]}) === (${a[0]}, (${b[0]}, ${c[0]}))`, () => {
                        const ab = compose([a[1], b[1]]);
                        const left = compose([ab, c[1]]);
                        const bc = compose([b[1], c[1]]);
                        const right = compose([a[1], bc]);
                        assert.deepEqual(left, right);
                    });
                }
            }
        }
    });

    it("no changes", () => {
        const actual = compose([]);
        assert.deepEqual(actual, cases.no_change);
    });

    it("Does not leave empty mark lists and fields", () => {
        const insertion: SF.Changeset = [
            { type: "Insert", id: 1, content: [{ type, value: 1 }] },
        ];
        const deletion: SF.Changeset = [
            { type: "Delete", id: 2, count: 1 },
        ];
        const actual = compose([insertion, deletion]);
        assert.deepEqual(actual, cases.no_change);
    });

    it("insert ○ modify", () => {
        const insert: SF.Changeset = [
            { type: "Insert", id: 1, content: [{ type, value: 1 }, { type, value: 2 }] },
        ];
        const modify: SF.Changeset = [{
            type: "Modify",
            changes: { valueChange: { value: 42 } },
        }];
        const expected: SF.Changeset = [
            {
                type: "MInsert",
                id: 1,
                content: { type, value: 1 },
                changes: { valueChange: { value: 42 } },
            },
            { type: "Insert", id: 1, content: [{ type, value: 2 }] },
        ];
        const actual = compose([insert, modify]);
        assert.deepEqual(actual, expected);
    });

    it("modify insert ○ modify", () => {
        const insert: SF.Changeset = [
            {
                type: "MInsert",
                id: 1,
                content: { type, value: 1 },
                changes: { valueChange: { value: 2 } },
            },
        ];
        const modify: SF.Changeset = [{
            type: "Modify",
            changes: { valueChange: { value: 3 } },
        }];
        const expected: SF.Changeset = [
            {
                type: "MInsert",
                id: 1,
                content: { type, value: 1 },
                changes: { valueChange: { value: 3 } },
            },
        ];
        const actual = compose([insert, modify]);
        assert.deepEqual(actual, expected);
    });

    it("delete ○ modify", () => {
        const deletion: SF.Changeset = [
            { type: "Delete", id: 1, count: 3 },
        ];
        const modify: SF.Changeset = [{
            type: "Modify",
            changes: { valueChange: { value: 2 } },
        }];
        const expected: SF.Changeset = [
            { type: "Delete", id: 1, count: 3 },
            {
                type: "Modify",
                changes: { valueChange: { value: 2 } },
            },
        ];
        const actual = compose([deletion, modify]);
        assert.deepEqual(actual, expected);
    });

    it("revive ○ modify", () => {
        const revive: SF.Changeset = [
            { type: "Revive", id: 1, count: 3, tomb },
        ];
        const modify: SF.Changeset = [{
            type: "Modify",
            changes: { valueChange: { value: 2 } },
        }];
        const expected: SF.Changeset = [
            {
                type: "MRevive",
                id: 1,
                tomb,
                changes: { valueChange: { value: 2 } },
            },
            { type: "Revive", id: 1, count: 2, tomb },
        ];
        const actual = compose([revive, modify]);
        assert.deepEqual(actual, expected);
    });

    it("modify ○ modify", () => {
        const modifyA: SF.Changeset = [{
            type: "Modify",
            changes: { valueChange: { value: 1 } },
        }];
        const modifyB: SF.Changeset = [{
            type: "Modify",
            changes: { valueChange: { value: 2 } },
        }];
        const actual = compose([modifyA, modifyB]);
        assert.deepEqual(actual, modifyB);
    });

    it("insert ○ delete (within insert)", () => {
        const insert: SF.Changeset = [
            { type: "Insert", id: 1, content: [
                { type, value: 1 },
                { type, value: 2 },
                { type, value: 3 },
            ] },
        ];
        const deletion: SF.Changeset = [
            1,
            { type: "Delete", id: 2, count: 1 },
        ];
        const actual = compose([insert, deletion]);
        const expected: SF.Changeset = [
            { type: "Insert", id: 1, content: [
                { type, value: 1 },
                { type, value: 3 },
            ] },
        ];
        assert.deepEqual(actual, expected);
    });

    it("insert ○ delete (across inserts)", () => {
        const insert: SF.Changeset = [
            { type: "Insert", id: 1, content: [
                { type, value: 1 },
                { type, value: 2 },
            ] },
            { type: "Insert", id: 2, content: [
                { type, value: 3 },
                { type, value: 4 },
            ] },
            { type: "Insert", id: 3, content: [
                { type, value: 5 },
                { type, value: 6 },
            ] },
        ];
        const deletion: SF.Changeset = [
            1,
            { type: "Delete", id: 2, count: 4 },
        ];
        const actual = compose([insert, deletion]);
        const expected: SF.Changeset = [
            { type: "Insert", id: 1, content: [
                { type, value: 1 },
            ] },
            { type: "Insert", id: 3, content: [
                { type, value: 6 },
            ] },
        ];
        assert.deepEqual(actual, expected);
    });

    it("modify ○ delete", () => {
        const modify: SF.Changeset = [{
            type: "Modify",
            changes: { valueChange: { value: 1 } },
        }];
        const deletion: SF.Changeset = [
            { type: "Delete", id: 2, count: 1 },
        ];
        const actual = compose([modify, deletion]);
        assert.deepEqual(actual, deletion);
    });

    it("delete ○ delete", () => {
        // Deletes ABC-----IJKLM
        const deleteA: SF.Changeset = [
            { type: "Delete", id: 1, count: 3 },
            5,
            { type: "Delete", id: 2, count: 5 },
        ];
        // Deletes DEFG--OP
        const deleteB: SF.Changeset = [
            { type: "Delete", id: 3, count: 4 },
            2,
            { type: "Delete", id: 4, count: 2 },
        ];
        const actual = compose([deleteA, deleteB]);
        // Deletes ABCDEFG-IJKLMNOP
        const expected: SF.Changeset = [
            { type: "Delete", id: 1, count: 3 },
            { type: "Delete", id: 3, count: 4 },
            1,
            { type: "Delete", id: 2, count: 5 },
            1,
            { type: "Delete", id: 4, count: 2 },
        ];
        assert.deepEqual(actual, expected);
    });

    it("revive ○ delete", () => {
        const revive: SF.Changeset = [
            { type: "Revive", id: 1, count: 5, tomb },
        ];
        const deletion: SF.Changeset = [
            1,
            { type: "Delete", id: 3, count: 1 },
            1,
            { type: "Delete", id: 4, count: 3 },
        ];
        const actual = compose([revive, deletion]);
        const expected: SF.Changeset = [
            { type: "Revive", id: 1, count: 2, tomb },
            { type: "Delete", id: 4, count: 1 },
        ];
        assert.deepEqual(actual, expected);
    });

    it("modify ○ insert", () => {
        const modify: SF.Changeset = [{
            type: "Modify",
            changes: { valueChange: { value: 1 } },
        }];
        const insert: SF.Changeset = [
            { type: "Insert", id: 1, content: [{ type, value: 2 }] },
        ];
        const expected: SF.Changeset = [
            { type: "Insert", id: 1, content: [{ type, value: 2 }] },
            {
                type: "Modify",
                changes: { valueChange: { value: 1 } },
            },
        ];
        const actual = compose([modify, insert]);
        assert.deepEqual(actual, expected);
    });

    it("delete ○ insert", () => {
        const deletion: SF.Changeset = [
            { type: "Delete", id: 1, count: 3 },
        ];
        const insert: SF.Changeset = [
            { type: "Insert", id: 1, content: [{ type, value: 2 }] },
        ];
        // TODO: test with merge-right policy as well
        const expected: SF.Changeset = [
            { type: "Insert", id: 1, content: [{ type, value: 2 }] },
            { type: "Delete", id: 1, count: 3 },
        ];
        const actual = compose([deletion, insert]);
        assert.deepEqual(actual, expected);
    });

    it("revive ○ insert", () => {
        const deletion: SF.Changeset = [
            { type: "Revive", id: 1, count: 5, tomb },
        ];
        const insert: SF.Changeset = [
            { type: "Insert", id: 1, content: [{ type, value: 2 }] },
        ];
        // TODO: test with merge-right policy as well
        const expected: SF.Changeset = [
            { type: "Insert", id: 1, content: [{ type, value: 2 }] },
            { type: "Revive", id: 1, count: 5, tomb },
        ];
        const actual = compose([deletion, insert]);
        assert.deepEqual(actual, expected);
    });

    it("insert ○ insert", () => {
        const insertA: SF.Changeset = [
            { type: "Insert", id: 1, content: [{ type, value: 1 }] },
            2,
            { type: "Insert", id: 2, content: [{ type, value: 2 }, { type, value: 3 }] },
        ];
        const insertB: SF.Changeset = [
            { type: "Insert", id: 3, content: [{ type, value: 3 }] },
            4,
            { type: "Insert", id: 4, content: [{ type, value: 4 }] },
        ];
        const actual = compose([insertA, insertB]);
        const expected: SF.Changeset = [
            { type: "Insert", id: 3, content: [{ type, value: 3 }] },
            { type: "Insert", id: 1, content: [{ type, value: 1 }] },
            2,
            { type: "Insert", id: 2, content: [{ type, value: 2 }] },
            { type: "Insert", id: 4, content: [{ type, value: 4 }] },
            { type: "Insert", id: 2, content: [{ type, value: 3 }] },
        ];
        assert.deepEqual(actual, expected);
    });

    it("modify ○ revive", () => {
        const modify: SF.Changeset = [{
            type: "Modify",
            changes: { valueChange: { value: 1 } },
        }];
        const revive: SF.Changeset = [
            { type: "Revive", id: 1, count: 2, tomb },
        ];
        const expected: SF.Changeset = [
            { type: "Revive", id: 1, count: 2, tomb },
            {
                type: "Modify",
                changes: { valueChange: { value: 1 } },
            },
        ];
        const actual = compose([modify, revive]);
        assert.deepEqual(actual, expected);
    });

    it("delete ○ revive", () => {
        const deletion: SF.Changeset = [
            { type: "Delete", id: 1, count: 3 },
        ];
        const revive: SF.Changeset = [
            { type: "Revive", id: 1, count: 2, tomb },
        ];
        // TODO: test with merge-right policy as well
        // TODO: test revive of deleted content
        const expected: SF.Changeset = [
            { type: "Revive", id: 1, count: 2, tomb },
            { type: "Delete", id: 1, count: 3 },
        ];
        const actual = compose([deletion, revive]);
        assert.deepEqual(actual, expected);
    });

    it("revive ○ revive", () => {
        const reviveA: SF.Changeset = [
            { type: "Revive", id: 1, count: 2, tomb },
        ];
        const reviveB: SF.Changeset = [
            { type: "Revive", id: 2, count: 3, tomb },
        ];
        // TODO: test with merge-right policy as well
        const expected: SF.Changeset = [
            { type: "Revive", id: 2, count: 3, tomb },
            { type: "Revive", id: 1, count: 2, tomb },
        ];
        const actual = compose([reviveA, reviveB]);
        assert.deepEqual(actual, expected);
    });

    it("insert ○ revive", () => {
        const insert: SF.Changeset = [
            { type: "Insert", id: 1, content: [{ type, value: 1 }] },
            2,
            { type: "Insert", id: 2, content: [{ type, value: 2 }, { type, value: 3 }] },
        ];
        const revive: SF.Changeset = [
            { type: "Revive", id: 3, count: 1, tomb },
            4,
            { type: "Revive", id: 4, count: 1, tomb },
        ];
        const actual = compose([insert, revive]);
        const expected: SF.Changeset = [
            { type: "Revive", id: 3, count: 1, tomb },
            { type: "Insert", id: 1, content: [{ type, value: 1 }] },
            2,
            { type: "Insert", id: 2, content: [{ type, value: 2 }] },
            { type: "Revive", id: 4, count: 1, tomb },
            { type: "Insert", id: 2, content: [{ type, value: 3 }] },
        ];
        assert.deepEqual(actual, expected);
    });
});
