/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { testGeneralPurposeTreeCursor } from "../../cursorTestSuite";
import { ITreeCursor } from "../../../core";
import { jsonableTreeFromCursor, singleTextCursor, chunkTree } from "../../../feature-libraries";

testGeneralPurposeTreeCursor(
    "basic chunk cursor",
    (data): ITreeCursor => {
        const inputCursor = singleTextCursor(data);
        const chunk = chunkTree(inputCursor);
        const cursor: ITreeCursor = chunk.cursor();
        cursor.enterNode(0);
        return cursor;
    },
    jsonableTreeFromCursor,
    true,
);
