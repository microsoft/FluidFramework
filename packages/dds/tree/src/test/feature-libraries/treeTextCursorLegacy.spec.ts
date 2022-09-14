/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { Jsonable } from "@fluidframework/datastore-definitions";
import { JsonCursor } from "../../domains";
import { defaultSchemaPolicy, ObjectForest } from "../../feature-libraries";

// Allow importing from this specific file which is being tested:
/* eslint-disable-next-line import/no-internal-modules */
import { jsonableTreeFromCursor, singleTextCursor } from "../../feature-libraries/treeTextCursorLegacy";
import { initializeForest, ITreeCursor, TreeNavigationResult } from "../../forest";
import { StoredSchemaRepository } from "../../schema-stored";
import { testCursors, testJsonCompatibleCursor } from "../cursorLegacy.spec";
import { JsonableTree } from "../../tree";
import { brand } from "../../util";

function checkTextCursorRequirements(clone: Jsonable, expected: Jsonable) {
    // Check objects are actually json compatible
    if (typeof clone === "object") {
        const text = JSON.stringify(clone);
        const parsed = JSON.parse(text);
        assert.deepEqual(parsed, expected);
    }
}

// Tests for TextCursor and jsonableTreeFromCursor.
testJsonCompatibleCursor(
    "textTreeFormat",
    (data?: Jsonable) => singleTextCursor(jsonableTreeFromCursor(new JsonCursor(data))),
    checkTextCursorRequirements,
);

// TODO: put these in a better place / unify with object forest tests.
testJsonCompatibleCursor(
    "object-forest cursor",
    (data?: Jsonable): ITreeCursor => {
        const schema = new StoredSchemaRepository(defaultSchemaPolicy);
        const forest = new ObjectForest(schema);
        const normalized = jsonableTreeFromCursor(new JsonCursor(data));
        // console.log(normalized);
        initializeForest(forest, [normalized]);
        const cursor = forest.allocateCursor();
        assert.equal(forest.tryMoveCursorTo(forest.root(forest.rootField), cursor), TreeNavigationResult.Ok);
        return cursor;
    },
    checkTextCursorRequirements,
);

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

testCursors(
    "textTreeFormat",
    testCases.map(([name, data]) => ({
        cursorName: name,
        cursor: singleTextCursor(jsonableTreeFromCursor(new JsonCursor(data))),
    })),
);
