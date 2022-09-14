/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { strict as assert } from "assert";
import { singleTextCursor } from "../../feature-libraries";
import { brand } from "../../util";
import { detachedFieldAsKey, TreeValue } from "../../tree";
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

        // Apply an edit to the first tree which inserts a node with a value
        insertTestValue(provider.trees[0], value);

        // Ensure that the first tree has the state we expect
        assert.equal(getTestValue(provider.trees[0]), value);
        // Ensure that the second tree receives the expected state from the first tree
        await provider.ensureSynchronized();
        assert.equal(getTestValue(provider.trees[1]), value);
        // Ensure that a tree which connects after the edit has already happened also catches up
        const joinedLaterTree = await provider.createTree();
        assert.equal(getTestValue(joinedLaterTree), value);
    });

    it("can summarize and load", async () => {
        const provider = await TestTreeProvider.create(1);
        const [summarizingTree] = provider.trees;
        const summarize = await provider.enableManualSummarization();
        const value = 42;
        insertTestValue(summarizingTree, value);
        await summarize();
        await provider.ensureSynchronized();
        const loadingTree = await provider.createTree();
        assert.equal(getTestValue(loadingTree), value);
    });

    describe("Editing", () => {
        it("can insert and delete a node", async () => {
            const value = "42";
            const provider = await TestTreeProvider.create(2);
            const [tree1, tree2] = provider.trees;

            // Insert node
            insertTestValue(tree1, value);

            await provider.ensureSynchronized();

            // Validate insertion
            assert.equal(getTestValue(tree2), value);

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

/**
 * Inserts a single node under the root of the tree with the given value.
 * Use {@link getTestValue} to read the value.
 */
function insertTestValue(tree: ISharedTree, value: TreeValue): void {
    // Apply an edit to the first tree which inserts a node with a value
    tree.runTransaction((forest, editor) => {
        const writeCursor = singleTextCursor({ type: brand("TestValue"), value });
        editor.insert({
            parent: undefined,
            parentField: detachedFieldAsKey(forest.rootField),
            parentIndex: 0,
        }, writeCursor);

        return TransactionResult.Apply;
    });
}

/**
 * Reads a value in a tree set by {@link insertTestValue} if it exists
 */
function getTestValue(tree: ISharedTree): TreeValue | undefined {
    const readCursor = tree.forest.allocateCursor();
    const destination = tree.forest.root(tree.forest.rootField);
    const cursorResult = tree.forest.tryMoveCursorTo(destination, readCursor);
    const { value } = readCursor;
    readCursor.free();
    tree.forest.forgetAnchor(destination);
    if (cursorResult === TreeNavigationResult.Ok) {
        return value;
    }

    return undefined;
}
