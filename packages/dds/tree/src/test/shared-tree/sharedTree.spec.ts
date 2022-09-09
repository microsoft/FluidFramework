/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { strict as assert } from "assert";
import { singleTextCursor } from "../../feature-libraries";
import { brand } from "../../util";
import { detachedFieldAsKey } from "../../tree";
import { TreeNavigationResult } from "../../forest";
import { TestTreeProvider } from "../utils";
import { ISharedTree } from "../../shared-tree";
import { TransactionResult } from "../../checkout";

describe("SharedTree", () => {
    it("can be connected to another tree", async () => {
        const provider = await TestTreeProvider.create(2);
        assert(provider.trees[0].isAttached());
        assert(provider.trees[1].isAttached());

        const value = "42";

        // Validate that the given tree has the state we create in this test
        function validateTree(tree: ISharedTree): void {
            const readCursor = tree.forest.allocateCursor();
            const destination = tree.forest.root(tree.forest.rootField);
            const cursorResult = tree.forest.tryMoveCursorTo(destination, readCursor);
            assert.equal(cursorResult, TreeNavigationResult.Ok);
            assert.equal(readCursor.seek(1), TreeNavigationResult.NotFound);
            assert.equal(readCursor.value, value);
            readCursor.free();
            tree.forest.forgetAnchor(destination);
        }

        // Apply an edit to the first tree which inserts a node with a value
        provider.trees[0].runTransaction((forest, editor) => {
            const writeCursor = singleTextCursor({ type: brand("Test"), value });
            editor.insert({
                parent: undefined,
                parentField: detachedFieldAsKey(forest.rootField),
                parentIndex: 0,
            }, writeCursor);

            return TransactionResult.Apply;
        });

        // Ensure that the first tree has the state we expect
        validateTree(provider.trees[0]);
        // Ensure that the second tree receives the expected state from the first tree
        await provider.ensureSynchronized();
        validateTree(provider.trees[1]);
        // Ensure that a tree which connects after the edit has already happened also catches up
        const joinedLaterTree = await provider.createTree();
        validateTree(joinedLaterTree);
    });

    describe("Editing", () => {
        it("can insert and delete a node", async () => {
            const value = "42";
            const provider = await TestTreeProvider.create(2);
            const [tree1, tree2] = provider.trees;

            // Insert node
            tree1.runTransaction((forest, editor) => {
                const writeCursor = singleTextCursor({ type: brand("Test"), value });
                editor.insert({
                    parent: undefined,
                    parentField: detachedFieldAsKey(forest.rootField),
                    parentIndex: 0,
                }, writeCursor);
                return TransactionResult.Apply;
            });

            await provider.ensureSynchronized();

            // Validate insertion
            {
                const readCursor = tree2.forest.allocateCursor();
                const destination = tree2.forest.root(tree2.forest.rootField);
                const cursorResult = tree2.forest.tryMoveCursorTo(destination, readCursor);
                assert.equal(cursorResult, TreeNavigationResult.Ok);
                assert.equal(readCursor.seek(1), TreeNavigationResult.NotFound);
                assert.equal(readCursor.value, value);
                readCursor.free();
                tree2.forest.forgetAnchor(destination);
            }

            // Delete node
            tree1.runTransaction((forest, editor) => {
                editor.delete({
                    parent: undefined,
                    parentField: detachedFieldAsKey(forest.rootField),
                    parentIndex: 0,
                }, 1);
                return TransactionResult.Apply;
            });

            await provider.ensureSynchronized();

            // Validate deletion
            {
                const readCursor = tree2.forest.allocateCursor();
                const destination = tree2.forest.root(tree2.forest.rootField);
                const cursorResult = tree2.forest.tryMoveCursorTo(destination, readCursor);
                assert.equal(cursorResult, TreeNavigationResult.NotFound);
                readCursor.free();
                tree2.forest.forgetAnchor(destination);
            }
        });
    });
});
