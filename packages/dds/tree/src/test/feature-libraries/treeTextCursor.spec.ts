/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { mapTreeFromCursor, singleMapTreeCursor } from "../../feature-libraries";

// Allow importing from this specific file which is being tested:
/* eslint-disable-next-line import/no-internal-modules */
import { jsonableTreeFromCursor, singleTextCursor } from "../../feature-libraries/treeTextCursor";

import { JsonableTree, ITreeCursorNew as ITreeCursor } from "../../tree";
import { brand } from "../../util";

const testCases: [string, JsonableTree][] = [
    ["minimal", { type: brand("Foo") }],
    ["value", { type: brand("Foo"), value: "test" }],
    ["local field", { type: brand("Foo"), fields: { x: [{ type: brand("Bar") }] } }],
    ["global field", { type: brand("Foo"), globalFields: { x: [{ type: brand("Bar") }] } }],
    ["both fields", {
        type: brand("Foo"),
        fields: { x: [{ type: brand("Bar") }] },
        globalFields: { x: [{ type: brand("Baz") }] },
    }],
    ["nested", { type: brand("Foo"), fields: { x: [{ type: brand("Bar") }, { type: brand("Foo"), value: 6 }] } }],
    ["multiple fields", {
        type: brand("Foo"),
        fields: {
            a: [{ type: brand("Bar") }],
            b: [{ type: brand("Baz") }],
        },
    }],
    ["double nested", {
        type: brand("Foo"),
        fields: {
            b: [{
                type: brand("Bar"),
                fields: { c: [{ type: brand("Baz") }] },
            }],
        },
    }],
    ["complex", {
        type: brand("Foo"),
        fields: {
            a: [{ type: brand("Bar") }],
            b: [{
                type: brand("Bar"),
                fields: {
                    c: [{ type: brand("Bar"), value: 6 }],
                },
            }],
        },
    }],
    ["siblings restored on up", {
        type: brand("Foo"),
        fields: {
            X: [
                {
                    type: brand("a"),
                    // Inner node so that when navigating up from it,
                    // The cursor's siblings value needs to be restored.
                    fields: { q: [{ type: brand("b") }] },
                },
                { type: brand("c") },
            ],
        },
    }],
];

// Checks to make sure singleTextCursor and test datasets are working properly,
// since its used in the below test suite to test other formats.
describe("JsonableTree extra tests", () => {
    describe("round trip", () => {
        for (const [name, data] of testCases) {
            it(name, () => {
                const cursor = singleTextCursor(data);
                const clone = jsonableTreeFromCursor(cursor);
                assert.deepEqual(clone, data);
                // Check objects are actually json compatible
                const text = JSON.stringify(clone);
                const parsed = JSON.parse(text);
                assert.deepEqual(parsed, data);
            });
        }
    });
});

/**
 * Uses jsonableTree support to check/compare other format support.
 */
function testTreeFormat<T>(
        suiteName: string,
        toCursor: (data: T) => ITreeCursor,
        fromCursor: (cursor: ITreeCursor) => T,
    ): void {
    describe(suiteName, () => {
        describe("round trip", () => {
            for (const [name, jsonableData] of testCases) {
                it(name, () => {
                    const inputCursor = singleTextCursor(jsonableData);
                    const convertedData: T = fromCursor(inputCursor);
                    const cursor = toCursor(convertedData);

                    // Check constructed cursor has the correct content, by reading it into a jsonableTree.
                    const jsonableClone = jsonableTreeFromCursor(cursor);
                    assert.deepEqual(jsonableClone, jsonableData);
                });
                // TODO: test rest of cursor API (getPath, enterNode, enterField etc).
            }
        });
    });
}

testTreeFormat("textTreeFormat", singleTextCursor, jsonableTreeFromCursor);
// TODO: this test suite should be refactored to move this into its own file and share the suite implementation.
testTreeFormat("mapTreeFormat", singleMapTreeCursor, mapTreeFromCursor);
