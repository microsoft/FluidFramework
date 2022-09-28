/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { FieldKey } from "../../tree";
import { brand } from "../../util";
import { generateRandomUpPath, generateRandomChange } from "./randomSequenceGenerator";

const testSeed = 432167897;
const fooKey = brand<FieldKey>("foo");
const keySet = new Set([fooKey]);

describe("generateRandomUpPath", () => {
    it("consistent given the same seed", () => {
        const upPath1 = generateRandomUpPath(keySet, testSeed, 10, 10);
        const upPath2 = generateRandomUpPath(keySet, testSeed, 10, 10);
        assert.deepStrictEqual(upPath1, upPath2);
    });
    it("Generates a path", () => {
        const upPath = generateRandomUpPath(keySet, testSeed, 3, 10);
        const expected = {
            parent: {
                parent: {
                    parent: undefined,
                    parentField: "foo",
                    parentIndex: 7,
                },
                parentField: "foo",
                parentIndex: 1,
            },
            parentField: "foo",
            parentIndex: 0,
        };
        assert.deepStrictEqual(upPath, expected);
    });
});

const pathGen = (seed: number) => generateRandomUpPath(keySet, seed, 2, 10);
describe("generateRandomChange", () => {
    it("consistent given the same seed.", () => {
        const change1 = generateRandomChange(testSeed, pathGen);
        const change2 = generateRandomChange(testSeed, pathGen);
        assert.deepStrictEqual(change1, change2);
    });
    it("Generates a change", () => {
        const change = generateRandomChange(testSeed, pathGen);
        const expected = {
            marks: {
                foo: [
                    1,
                    {
                        type: "Modify",
                        fields: {
                            foo: [
                                1,
                                {
                                    type: "Modify",
                                    fields: {
                                            foo: [
                                            1,
                                            {
                                                type: "Delete",
                                                count: 5,
                                                id: 0,
                                            },
                                        ],
                                    },
                                },
                            ],
                        },
                    },
                ],
            },
        };
        assert.deepStrictEqual(change, expected);
    });
});
