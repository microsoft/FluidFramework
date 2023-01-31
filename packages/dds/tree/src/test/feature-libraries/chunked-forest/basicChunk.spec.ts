/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { testGeneralPurposeTreeCursor } from "../../cursorTestSuite";
import { ITreeCursor, JsonableTree } from "../../../core";
import { jsonableTreeFromCursor, singleTextCursor, chunkTree } from "../../../feature-libraries";
import { brand } from "../../../util";

describe("basic chunk", () => {
    it.skip("calling chunkTree on existing chunk adds a reference", () => {
        const data: JsonableTree = { type: brand("Foo"), value: "test" };
        const inputCursor = singleTextCursor(data);
        const chunk = chunkTree(inputCursor);
        assert(!chunk.isShared(), "newly created chunk should not have more than one reference");

        const chunkCursor = chunk.cursor();
        const newChunk = chunkTree(chunkCursor);
        assert(
            newChunk.isShared() && chunk.isShared(),
            "chunk created off of existing chunk should be shared",
        );
    });

    testGeneralPurposeTreeCursor(
        "",
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
});
