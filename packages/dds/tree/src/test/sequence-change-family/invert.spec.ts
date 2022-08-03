/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { Transposed as T, Value } from "../../changeset";
import { sequenceChangeRebaser, SequenceChangeset } from "../../feature-libraries";
import { TreeSchemaIdentifier } from "../../schema";
import { brand } from "../../util";
import { deepFreeze } from "../utils";

const type: TreeSchemaIdentifier = brand("Node");

function invert(change: SequenceChangeset): SequenceChangeset {
    deepFreeze(change);
    return sequenceChangeRebaser.invert(change);
}

const tag = "TestTag";

function asInputForest(markList: T.MarkList): SequenceChangeset {
    return {
        opRanges: [{ min: 0, tag }],
        marks: { root: markList },
    };
}

function asOutputForest(markList: T.MarkList): SequenceChangeset {
    return {
        opRanges: [{ min: 0, tag: `-${tag}` }],
        marks: { root: markList },
    };
}

describe("SequenceChangeFamily - Invert", () => {
    it("no changes", () => {
        const input = asInputForest([]);
        const expected = asOutputForest([]);
        const actual = invert(input);
        assert.deepEqual(actual, expected);
    });

    it("set root", () => {
        const input = asInputForest([
            { type: "Modify", value: { type: "Set", value: 42 } },
        ]);
        const expected = asOutputForest([
            { type: "Modify", value: { type: "Revert", change: tag } },
        ]);
        const actual = invert(input);
        assert.deepEqual(actual, expected);
    });

    it("set child", () => {
        const input = asInputForest([
            {
                type: "Modify",
                fields: {
                    foo: [
                        10,
                        {
                            type: "Modify",
                            value: { type: "Set", value: 42 },
                        },
                    ],
                },
            },
        ]);
        const expected = asOutputForest([
            {
                type: "Modify",
                fields: {
                    foo: [
                        10,
                        {
                            type: "Modify",
                            value: { type: "Revert", change: tag },
                        },
                    ],
                },
            },
        ]);
        const actual = invert(input);
        assert.deepEqual(actual, expected);
    });

    it("insert => delete", () => {
        const input = asInputForest([
            [{
                type: "Insert",
                id: 1,
                content: [{ type, value: 42 }, { type, value: 43 }],
            }],
        ]);
        const expected = asOutputForest([
            {
                type: "Delete",
                id: 1,
                count: 2,
            },
        ]);
        const actual = invert(input);
        assert.deepEqual(actual, expected);
    });

    it("modified insert => delete", () => {
        const input = asInputForest([
            [{
                type: "MInsert",
                id: 1,
                content: { type, value: 42 },
                fields: { foo: [{ type: "Modify", value: { type: "Set", value: 42 } }] },
            }],
        ]);
        const expected = asOutputForest([
            {
                type: "Delete",
                id: 1,
                count: 1,
            },
        ]);
        const actual = invert(input);
        assert.deepEqual(actual, expected);
    });

    it("delete => revive", () => {
        const input = asInputForest([
            {
                type: "Delete",
                id: 1,
                count: 2,
            },
        ]);
        const expected = asOutputForest([
            {
                type: "Revive",
                id: 1,
                count: 2,
                tomb: tag,
            },
        ]);
        const actual = invert(input);
        assert.deepEqual(actual, expected);
    });

    it("revive => delete", () => {
        const input = asInputForest([
            {
                type: "Revive",
                id: 1,
                count: 2,
                tomb: tag,
            },
        ]);
        const expected = asOutputForest([
            {
                type: "Delete",
                id: 1,
                count: 2,
            },
        ]);
        const actual = invert(input);
        assert.deepEqual(actual, expected);
    });
});
