/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { ObjectForest } from "../feature-libraries";

// Allow importing from this specific file which is being tested:
/* eslint-disable-next-line import/no-internal-modules */
import { jsonableTreeFromCursor, singleTextCursor } from "../feature-libraries/treeTextCursor";
import { initializeForest, ITreeCursor, TreeNavigationResult } from "../forest";

import { JsonableTree } from "../tree";
import { brand } from "../util";

const testCases: [string, JsonableTree][] = [
    ["minimal", { type: brand("Foo") }],
    ["value", { type: brand("Foo"), value: "test" }],
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

function testCursor(suiteName: string, factory: (data: JsonableTree) => ITreeCursor): void {
    describe(suiteName, () => {
        describe("round trip", () => {
            for (const [name, data] of testCases) {
                it(name, () => {
                    const cursor = factory(data);
                    const clone = jsonableTreeFromCursor(cursor);
                    assert.deepEqual(clone, data);
                    // Check objects are actually json compatible
                    const text = JSON.stringify(clone);
                    const parsed = JSON.parse(text);
                    assert.deepEqual(parsed, data);
                });
            }
        });

        it("up from root", () => {
            const cursor = singleTextCursor({ type: brand("Foo") });
            assert.equal(cursor.up(), TreeNavigationResult.NotFound);
        });
    });
}

// Tests for TextCursor and jsonableTreeFromCursor.
testCursor("textTreeFormat", (data): ITreeCursor => singleTextCursor(data));

// TODO: put these in a better place / unify with object forest tests.
testCursor("object-forest cursor", (data): ITreeCursor => {
    const forest = new ObjectForest();
    initializeForest(forest, [data]);
    const cursor = forest.allocateCursor();
    assert.equal(forest.tryMoveCursorTo(forest.root(forest.rootField), cursor), TreeNavigationResult.Ok);
    return cursor;
});
