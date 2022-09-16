/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import {
    mockChildChangeInverter,
    SequenceField as SF,
} from "../../../feature-libraries";
import { TreeSchemaIdentifier } from "../../../schema-stored";
import { brand } from "../../../util";
import { deepFreeze } from "../../utils";
import { TestChangeset } from "./utils";

const type: TreeSchemaIdentifier = brand("Node");

function invert(change: TestChangeset): TestChangeset {
    deepFreeze(change);
    return SF.invert(change, mockChildChangeInverter);
}

function shallowInvert(change: SF.Changeset<unknown>): SF.Changeset<unknown> {
    deepFreeze(change);
    return SF.invert(change,  () => assert.fail("Unexpected call to child inverter"));
}

describe("SequenceField - Invert", () => {
    it("no changes", () => {
        const input: SF.Changeset = [];
        const expected: SF.Changeset = [];
        const actual = shallowInvert(input);
        assert.deepEqual(actual, expected);
    });

    it("child changes", () => {
        const input: TestChangeset = [
            { type: "Modify", changes: { intentions: [1], ref: 0 } },
        ];
        const expected: TestChangeset = [
            { type: "Modify", changes: { intentions: [1], ref: 0 } },
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
        const actual = shallowInvert(input);
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
        const actual = shallowInvert(input);
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
        const actual = shallowInvert(input);
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
        const actual = shallowInvert(input);
        assert.deepEqual(actual, expected);
    });
});
