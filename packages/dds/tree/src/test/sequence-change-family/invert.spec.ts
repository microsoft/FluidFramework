/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { Transposed as T } from "../../changeset";
import {
    DUMMY_INVERSE_VALUE,
    DUMMY_INVERT_TAG,
    sequenceChangeRebaser,
    SequenceChangeset,
} from "../../feature-libraries";
import { TreeSchemaIdentifier } from "../../schema-stored";
import { brand } from "../../util";
import { deepFreeze } from "../utils";

const type: TreeSchemaIdentifier = brand("Node");

function invert(change: SequenceChangeset): SequenceChangeset {
    deepFreeze(change);
    return sequenceChangeRebaser.invert(change);
}

describe("SequenceChangeFamily - Invert", () => {
    for (const nest of [false, true]) {
        describe(nest ? "Nested" : "Root", () => {
            function asInputForest(markList: T.MarkList): SequenceChangeset {
                return {
                    marks: { root: nest ? [{ type: "Modify", fields: { foo: markList } }] : markList },
                };
            }

            function asOutputForest(markList: T.MarkList): SequenceChangeset {
                return {
                    marks: { root: nest ? [{ type: "Modify", fields: { foo: markList } }] : markList },
                };
            }

            it("no changes", () => {
                const input = asInputForest([]);
                const expected = asOutputForest([]);
                const actual = invert(input);
                assert.deepEqual(actual, expected);
            });

            it("set value => set value", () => {
                const input = asInputForest([
                    { type: "Modify", value: { id: 1, value: 42 } },
                ]);
                const expected = asOutputForest([
                    { type: "Modify", value: { id: 1, value: DUMMY_INVERSE_VALUE } },
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
                        fields: { foo: [{ type: "Modify", value: { id: 1, value: 42 } }] },
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
                        tomb: DUMMY_INVERT_TAG,
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
                        tomb: DUMMY_INVERT_TAG,
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
    }
});
