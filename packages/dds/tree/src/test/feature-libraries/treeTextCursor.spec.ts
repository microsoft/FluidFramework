/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { strict as assert } from "assert";
import { initializeForest, InMemoryStoredSchemaRepository, TreeNavigationResult } from "../../core";
import { jsonSchemaData } from "../../domains";
import {
    defaultSchemaPolicy,
    jsonableTreeFromCursorNew,
    ObjectForest,
    singleTextCursorNew,
} from "../../feature-libraries";
import { ITreeCursorNew } from "../../tree";
import { cursorTestCases, testCursors, testJsonableTreeCursor } from "../cursor.spec";

// Tests for TextCursor and jsonableTreeFromCursor.
// Checks to make sure singleTextCursor and test datasets are working properly,
// since its used in the below test suite to test other formats.
testJsonableTreeCursor("textTreeFormat", singleTextCursorNew, jsonableTreeFromCursorNew);

// TODO: put these in a better place / unify with object forest tests.
testJsonableTreeCursor(
    "object-forest cursor",
    (data): ITreeCursorNew => {
        const forest = new ObjectForest(
            new InMemoryStoredSchemaRepository(defaultSchemaPolicy, jsonSchemaData),
        );
        initializeForest(forest, [singleTextCursorNew(data)]);
        const cursor = forest.allocateCursor();
        assert.equal(
            forest.tryMoveCursorTo(forest.root(forest.rootField), cursor),
            TreeNavigationResult.Ok,
        );
        return cursor;
    },
    jsonableTreeFromCursorNew,
    false,
);

testCursors(
    "textTreeFormat",
    cursorTestCases.map(([name, data]) => ({
        cursorName: name,
        cursor: singleTextCursorNew(data),
    })),
);
