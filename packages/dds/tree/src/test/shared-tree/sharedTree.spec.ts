/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { strict as assert } from "assert";
import { TransactionResult } from "../../transaction";
import { singleTextCursor } from "../../feature-libraries";
import { brand } from "../../util";
import { detachedFieldAsKey } from "../../tree";
import { TreeNavigationResult } from "../../forest";
import { TestTreeProvider } from "../utils";

describe("SharedTree", () => {
    it("can be connected to another tree", async () => {
        const trees = await TestTreeProvider.createTrees(2);
        assert(trees[0].isAttached());
        assert(trees[1].isAttached());

        const value = "42";

        trees[0].runTransaction((forest, editor) => {
            const writeCursor = singleTextCursor({ type: brand("Test"), value });
            editor.insert({
                parent: undefined,
                parentField: detachedFieldAsKey(forest.rootField),
                parentIndex: 0,
            }, writeCursor);

            return TransactionResult.Apply;
        });

        await trees.ensureSynchronized();

        const readCursor = trees[1].forest.allocateCursor();
        const destination = trees[1].forest.root(trees[1].forest.rootField);
        const cursorResult = trees[1].forest.tryMoveCursorTo(destination, readCursor);
        assert(cursorResult === TreeNavigationResult.Ok);
        assert(readCursor.value === value);
    });
});
