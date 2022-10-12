/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { jsonSchemaData } from "../../domains";
import { defaultSchemaPolicy, ObjectForest, singleTextCursorNew } from "../../feature-libraries";

// Allow importing from this specific file which is being tested:
import {
    jsonableTreeFromCursor,
    singleTextCursor,
    // eslint-disable-next-line import/no-internal-modules
} from "../../feature-libraries/treeTextCursorLegacy";
import { initializeForest, ITreeCursor, TreeNavigationResult } from "../../forest";
import { InMemoryStoredSchemaRepository } from "../../schema-stored";
import { cursorTestCases } from "../cursor.spec";
import { testCursors, testJsonableTreeCursor } from "../cursorLegacy.spec";

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
        initializeForest(forest, [singleTextCursorNew(data)]);
        const cursor = forest.allocateCursor();
        assert.equal(
            forest.tryMoveCursorTo(forest.root(forest.rootField), cursor),
            TreeNavigationResult.Ok,
        );
        return cursor;
    },
    jsonableTreeFromCursor,
);

testCursors(
    "textTreeFormat",
    cursorTestCases.map(([name, data]) => ({
        cursorName: name,
        cursor: singleTextCursor(data),
    })),
);
