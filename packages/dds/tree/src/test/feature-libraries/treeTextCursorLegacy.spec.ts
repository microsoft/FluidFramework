/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// Allow importing from this specific file which is being tested:
import {
    jsonableTreeFromCursor,
    singleTextCursor,
    // eslint-disable-next-line import/no-internal-modules
} from "../../feature-libraries/treeTextCursorLegacy";
import { cursorTestCases } from "../cursor.spec";
import { testCursors, testJsonableTreeCursor } from "../cursorLegacy.spec";

// Tests for TextCursor and jsonableTreeFromCursor.
// Checks to make sure singleTextCursor and test datasets are working properly,
// since its used in the below test suite to test other formats.
testJsonableTreeCursor("textTreeFormat", singleTextCursor, jsonableTreeFromCursor);

testCursors(
    "textTreeFormat",
    cursorTestCases.map(([name, data]) => ({
        cursorName: name,
        cursor: singleTextCursor(data),
    })),
);
