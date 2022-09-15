/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import {
    NodeChangeset,
    SequenceField as SF,
} from "../../../feature-libraries";
import { TreeSchemaIdentifier } from "../../../schema-stored";
import { brand } from "../../../util";
import { deepFreeze } from "../../utils";

const type: TreeSchemaIdentifier = brand("Node");

function childInverter(change: NodeChangeset): NodeChangeset {
    assert.equal(change.fieldChanges, undefined);
    assert.notEqual(change.valueChange?.value, undefined);
    // Use numerical inverse for testing purposes
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    return { valueChange: { value: -change.valueChange!.value! } };
}

function invert(change: SF.Changeset): SF.Changeset {
    deepFreeze(change);
    return SF.sequenceFieldChangeRebaser.invert(change, childInverter);
}

describe("SequenceChangeFamily - Invert", () => {
    it("no changes", () => {
        const input: SF.Changeset = [];
        const expected: SF.Changeset = [];
        const actual = invert(input);
        assert.deepEqual(actual, expected);
    });

    it("child changes", () => {
        const input: SF.Changeset = [
            { type: "Modify", changes: { valueChange: { value: 42 } } },
        ];
        const expected: SF.Changeset = [
            { type: "Modify", changes: { valueChange: { value: -42 } } },
        ];
        const actual = invert(input);
        assert.deepEqual(actual, expected);
    });

    it("insert => delete", () => {
        const input: SF.Changeset = [
            {
                type: "Insert",
                id: 1,
                content: [{ type, value: 42 }, { type, value: 43 }],
            },
        ];
        const expected: SF.Changeset = [
            {
                type: "Delete",
                id: 1,
                count: 2,
            },
        ];
        const actual = invert(input);
        assert.deepEqual(actual, expected);
    });

    it("modified insert => delete", () => {
        const input: SF.Changeset = [
            {
                type: "MInsert",
                id: 1,
                content: { type, value: 42 },
                changes: { valueChange: { value: 43 } },
            },
        ];
        const expected: SF.Changeset = [
            {
                type: "Delete",
                id: 1,
                count: 1,
            },
        ];
        const actual = invert(input);
        assert.deepEqual(actual, expected);
    });

    it("delete => revive", () => {
        const input: SF.Changeset = [
            {
                type: "Delete",
                id: 1,
                count: 2,
            },
        ];
        const expected: SF.Changeset = [
            {
                type: "Revive",
                id: 1,
                count: 2,
                tomb: SF.DUMMY_INVERT_TAG,
            },
        ];
        const actual = invert(input);
        assert.deepEqual(actual, expected);
    });

    it("revive => delete", () => {
        const input: SF.Changeset = [
            {
                type: "Revive",
                id: 1,
                count: 2,
                tomb: SF.DUMMY_INVERT_TAG,
            },
        ];
        const expected: SF.Changeset = [
            {
                type: "Delete",
                id: 1,
                count: 2,
            },
        ];
        const actual = invert(input);
        assert.deepEqual(actual, expected);
    });
});
