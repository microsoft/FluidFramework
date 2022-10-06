/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { fail, strict as assert } from "assert";
import {
    FieldKinds,
    singleTextCursor,
    anchorSymbol,
    isUnwrappedNode,
    valueSymbol,
    getSchemaString,
} from "../../feature-libraries";
import { brand } from "../../util";
import { detachedFieldAsKey, rootFieldKey, symbolFromKey, TreeValue } from "../../tree";
import { TreeNavigationResult } from "../../forest";
import { TestTreeProvider } from "../utils";
import { ISharedTree } from "../../shared-tree";
import { TransactionResult } from "../../checkout";
import { fieldSchema, GlobalFieldKey, namedTreeSchema, SchemaData } from "../../schema-stored";

const globalFieldKey: GlobalFieldKey = brand("globalFieldKey");
const globalFieldKeySymbol = symbolFromKey(globalFieldKey);

describe("SharedTree", () => {
    it("reads only one node", async () => {
        // This is a regression test for a scenario in which a transaction would apply its delta twice,
        // inserting two nodes instead of just one
        const provider = await TestTreeProvider.create(1);
        provider.trees[0].runTransaction((f, editor) => {
            const writeCursor = singleTextCursor({ type: brand("LonelyNode") });
            editor.insert(
                {
                    parent: undefined,
                    parentField: detachedFieldAsKey(f.rootField),
                    parentIndex: 0,
                },
                writeCursor,
            );

            return TransactionResult.Apply;
        });

        const { forest } = provider.trees[0];
        const readCursor = forest.allocateCursor();
        const destination = forest.root(provider.trees[0].forest.rootField);
        const cursorResult = forest.tryMoveCursorTo(destination, readCursor);
        assert.equal(cursorResult, TreeNavigationResult.Ok);
        assert.equal(readCursor.seek(1), TreeNavigationResult.NotFound);
        readCursor.free();
        forest.forgetAnchor(destination);
    });

    it("can be connected to another tree", async () => {
        const provider = await TestTreeProvider.create(2);
        assert(provider.trees[0].isAttached());
        assert(provider.trees[1].isAttached());

        const value = "42";
        const expectedSchema = getSchemaString(testSchema);

        // Apply an edit to the first tree which inserts a node with a value
        initializeTestTreeWithValue(provider.trees[0], value);

        // Ensure that the first tree has the state we expect
        assert.equal(getTestValue(provider.trees[0]), value);
        assert.equal(getSchemaString(provider.trees[0].storedSchema), expectedSchema);
        // Ensure that the second tree receives the expected state from the first tree
        await provider.ensureSynchronized();
        assert.equal(getTestValue(provider.trees[1]), value);
        // Ensure second tree got the schema from initialization:
        assert.equal(getSchemaString(provider.trees[1].storedSchema), expectedSchema);
        // Ensure that a tree which connects after the edit has already happened also catches up
        const joinedLaterTree = await provider.createTree();
        assert.equal(getTestValue(joinedLaterTree), value);
        // Ensure schema catchup works:
        assert.equal(getSchemaString(provider.trees[1].storedSchema), expectedSchema);
    });

    it("can summarize and load", async () => {
        const provider = await TestTreeProvider.create(1);
        const [summarizingTree] = provider.trees;
        const summarize = await provider.enableManualSummarization();
        const value = 42;
        initializeTestTreeWithValue(summarizingTree, value);
        await summarize();
        await provider.ensureSynchronized();
        const loadingTree = await provider.createTree();
        assert.equal(getTestValue(loadingTree), value);
        assert.equal(getSchemaString(loadingTree.storedSchema), getSchemaString(testSchema));
    });

    describe("Editing", () => {
        it("can insert and delete a node", async () => {
            const value = "42";
            const provider = await TestTreeProvider.create(2);
            const [tree1, tree2] = provider.trees;

            // Insert node
            initializeTestTreeWithValue(tree1, value);

            await provider.ensureSynchronized();

            // Validate insertion
            assert.equal(getTestValue(tree2), value);

            // Delete node
            tree1.runTransaction((forest, editor) => {
                editor.delete(
                    {
                        parent: undefined,
                        parentField: detachedFieldAsKey(forest.rootField),
                        parentIndex: 0,
                    },
                    1,
                );
                return TransactionResult.Apply;
            });

            await provider.ensureSynchronized();

            assert.equal(getTestValue(tree1), undefined);
            assert.equal(getTestValue(tree2), undefined);
        });

        // TODO: Add global field representation in changesets and delta
        it.skip("can edit a global field", async () => {
            const provider = await TestTreeProvider.create(2);
            const [tree1, tree2] = provider.trees;

            // Insert root node
            initializeTestTreeWithValue(tree1, 42);

            // Insert child in global field
            tree1.runTransaction((forest, editor) => {
                const writeCursor = singleTextCursor({ type: brand("TestValue"), value: 43 });
                editor.insert(
                    {
                        parent: {
                            parent: undefined,
                            parentField: detachedFieldAsKey(forest.rootField),
                            parentIndex: 0,
                        },
                        parentField: globalFieldKeySymbol,
                        parentIndex: 0,
                    },
                    writeCursor,
                );

                return TransactionResult.Apply;
            });

            await provider.ensureSynchronized();

            // Validate insertion
            {
                const readCursor = tree2.forest.allocateCursor();
                const destination = tree2.forest.root(tree2.forest.rootField);
                const cursorResult1 = tree2.forest.tryMoveCursorTo(destination, readCursor);
                assert.equal(cursorResult1, TreeNavigationResult.Ok);
                const cursorResult2 = readCursor.down(globalFieldKeySymbol, 0);
                assert.equal(cursorResult2, TreeNavigationResult.Ok);
                const { value } = readCursor;
                assert.equal(value, 43);
                readCursor.free();
                tree2.forest.forgetAnchor(destination);
            }

            // Delete node
            tree2.runTransaction((forest, editor) => {
                editor.delete(
                    {
                        parent: {
                            parent: undefined,
                            parentField: detachedFieldAsKey(forest.rootField),
                            parentIndex: 0,
                        },
                        parentField: globalFieldKeySymbol,
                        parentIndex: 0,
                    },
                    1,
                );
                return TransactionResult.Apply;
            });

            await provider.ensureSynchronized();

            // Validate deletion
            {
                const readCursor = tree2.forest.allocateCursor();
                const destination = tree2.forest.root(tree2.forest.rootField);
                const cursorResult1 = tree2.forest.tryMoveCursorTo(destination, readCursor);
                assert.equal(cursorResult1, TreeNavigationResult.Ok);
                const cursorResult2 = readCursor.down(globalFieldKeySymbol, 0);
                assert.equal(cursorResult2, TreeNavigationResult.NotFound);
            }
        });

        it("can insert multiple nodes", async () => {
            const provider = await TestTreeProvider.create(2);
            const [tree1, tree2] = provider.trees;

            // Insert nodes
            tree1.runTransaction((forest, editor) => {
                editor.insert(
                    {
                        parent: undefined,
                        parentField: detachedFieldAsKey(forest.rootField),
                        parentIndex: 0,
                    },
                    singleTextCursor({ type: brand("Test"), value: 1 }),
                );
                return TransactionResult.Apply;
            });

            tree1.runTransaction((forest, editor) => {
                editor.insert(
                    {
                        parent: undefined,
                        parentField: detachedFieldAsKey(forest.rootField),
                        parentIndex: 1,
                    },
                    singleTextCursor({ type: brand("Test"), value: 2 }),
                );
                return TransactionResult.Apply;
            });

            await provider.ensureSynchronized();

            // Validate insertion
            {
                const readCursor = tree2.forest.allocateCursor();
                const destination = tree2.forest.root(tree2.forest.rootField);
                const cursorResult = tree2.forest.tryMoveCursorTo(destination, readCursor);
                assert.equal(cursorResult, TreeNavigationResult.Ok);
                assert.equal(readCursor.value, 1);
                assert.equal(readCursor.seek(1), TreeNavigationResult.Ok);
                assert.equal(readCursor.value, 2);
                assert.equal(readCursor.seek(1), TreeNavigationResult.NotFound);
                readCursor.free();
                tree2.forest.forgetAnchor(destination);
            }
        });
    });

    it("can edit using editable-tree", async () => {
        const provider = await TestTreeProvider.create(1);
        const [sharedTree] = provider.trees;

        // Currently EditableTree does not have a way to hold onto fields/sequences across edits, only nodes, so insert a node to get started.

        // Insert node
        initializeTestTreeWithValue(sharedTree, 1);

        // Locate node to edit using EditableTree API
        const editable = sharedTree.root;
        assert(isUnwrappedNode(editable));
        const anchor = editable[anchorSymbol];

        // Check value we will edit is what we initialized it to.
        assert.equal(editable[valueSymbol], 1);

        // Perform an edit
        sharedTree.runTransaction((forest, editor) => {
            // Perform an edit
            const path = sharedTree.locate(anchor) ?? fail("anchor should exist");
            sharedTree.context.prepareForEdit();
            editor.setValue(path, 2);

            // Check that the edit is reflected in the EditableTree
            assert.equal(editable[valueSymbol], 2);

            sharedTree.context.prepareForEdit();
            return TransactionResult.Apply;
        });

        // Check that the edit is reflected in the EditableTree after the transaction.
        assert.equal(editable[valueSymbol], 2);
    });
});

const rootFieldSchema = fieldSchema(FieldKinds.value);
const globalFieldSchema = fieldSchema(FieldKinds.value);
const rootNodeSchema = namedTreeSchema({
    name: brand("TestValue"),
    extraLocalFields: fieldSchema(FieldKinds.sequence),
    globalFields: [globalFieldKey],
});
const testSchema: SchemaData = {
    treeSchema: new Map([[rootNodeSchema.name, rootNodeSchema]]),
    globalFieldSchema: new Map([
        [rootFieldKey, rootFieldSchema],
        [globalFieldKey, globalFieldSchema],
    ]),
};

/**
 * Inserts a single node under the root of the tree with the given value.
 * Use {@link getTestValue} to read the value.
 */
function initializeTestTreeWithValue(tree: ISharedTree, value: TreeValue): void {
    tree.storedSchema.update(testSchema);

    // Apply an edit to the tree which inserts a node with a value
    tree.runTransaction((forest, editor) => {
        const writeCursor = singleTextCursor({ type: brand("TestValue"), value });
        editor.insert(
            {
                parent: undefined,
                parentField: detachedFieldAsKey(forest.rootField),
                parentIndex: 0,
            },
            writeCursor,
        );

        return TransactionResult.Apply;
    });
}

/**
 * Reads a value in a tree set by {@link initializeTestTreeWithValue} if it exists.
 */
function getTestValue({ forest }: ISharedTree): TreeValue | undefined {
    const readCursor = forest.allocateCursor();
    const destination = forest.root(forest.rootField);
    const cursorResult = forest.tryMoveCursorTo(destination, readCursor);
    if (cursorResult !== TreeNavigationResult.Ok) {
        return undefined;
    }
    const { value } = readCursor;
    readCursor.free();
    forest.forgetAnchor(destination);
    if (cursorResult === TreeNavigationResult.Ok) {
        return value;
    }

    return undefined;
}
