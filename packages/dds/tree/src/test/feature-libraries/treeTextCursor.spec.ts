/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { jsonableTreeFromCursorNew, singleTextCursorNew } from "../../feature-libraries";
import { cursorTestCases, testCursors, testJsonableTreeCursor } from "../cursor.spec";

// Tests for TextCursor and jsonableTreeFromCursor.
// Checks to make sure singleTextCursor and test datasets are working properly,
// since its used in the below test suite to test other formats.
testJsonableTreeCursor("textTreeFormat", singleTextCursorNew, jsonableTreeFromCursorNew);

// TODO make object forest cursor compatible with new API
// TODO: put these in a better place / unify with object forest tests.
// testJsonCompatibleCursor(
//     "object-forest cursor",
//     (data): ITreeCursor => {
//         const schemaData: SchemaData = {
//             globalFieldSchema: new Map(),
//             treeSchema: jsonTypeSchema,
//         };
//         const forest = new ObjectForest(new StoredSchemaRepository(defaultSchemaPolicy, schemaData));
//         initializeForest(forest, [singleTextCursorNew(data)]);
//         const cursor = forest.allocateCursor();
//         assert.equal(forest.tryMoveCursorTo(forest.root(forest.rootField), cursor), TreeNavigationResult.Ok);
//         return cursor;
//     },
//     jsonableTreeFromCursor,
// );

testCursors(
    "textTreeFormat",
    cursorTestCases.map(([name, data]) => ({
        cursorName: name,
        cursor: singleTextCursorNew(data),
    })),
);
