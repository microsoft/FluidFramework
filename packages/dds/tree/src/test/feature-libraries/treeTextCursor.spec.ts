/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { strict as assert } from "assert";
import { initializeForest, InMemoryStoredSchemaRepository, moveToDetachedField } from "../../core";
import { jsonSchemaData } from "../../domains";
import {
    defaultSchemaPolicy,
    jsonableTreeFromCursor,
    ObjectForest,
    singleTextCursor,
} from "../../feature-libraries";
import { ITreeCursor } from "../../tree";
import { cursorTestCases, testCursors, testJsonableTreeCursor } from "../cursor.spec";

// Tests for TextCursor and jsonableTreeFromCursor.
// Checks to make sure singleTextCursor and test datasets are working properly,
// since its used in the below test suite to test other formats.
testJsonableTreeCursor("textTreeFormat", singleTextCursor, jsonableTreeFromCursor);

// TODO: put these in a better place / unify with object forest tests.
testJsonableTreeCursor(
    "object-forest cursor",
    (data): ITreeCursor => {
        const forest = new ObjectForest(
            new InMemoryStoredSchemaRepository(defaultSchemaPolicy, jsonSchemaData),
        );
        initializeForest(forest, [singleTextCursor(data)]);
        const cursor = forest.allocateCursor();
        moveToDetachedField(forest, cursor);
        assert(cursor.firstNode());
        return cursor;
    },
    jsonableTreeFromCursor,
    false,
);

testCursors(
    "textTreeFormat",
    cursorTestCases.map(([name, data]) => ({
        cursorName: name,
        cursor: singleTextCursor(data),
    })),
);
