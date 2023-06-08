/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { strict as assert } from "assert";
import { UndoRedoStackManager } from "@fluidframework/undo-redo";
import { SharedTreeViewUndoRedoHandler } from "../../shared-tree";
import { TestTreeProviderLite, insert } from "../utils";

describe("ShareTreeUndoRedoHandler", () => {
    it("creates revertibles for undoable commits", () => {
        const undoRedoStack = new UndoRedoStackManager();
        const handler = new SharedTreeViewUndoRedoHandler(undoRedoStack);
        const provider = new TestTreeProviderLite();

        const value = "42";
        const tree = provider.trees[0];
        handler.attachTree(tree);

        // Insert node
        insert(tree, 0, value);
        provider.processMessages();

        // Validate insertion
        assert.equal(getTestValue(tree2), value);

        // Undo node insertion
        undoRedoStack.undoOperation();
        provider.processMessages();

        assert.equal(getTestValue(tree1), undefined);
        assert.equal(getTestValue(tree2), undefined);

        // Redo node insertion
        tree1.redo();
        provider.processMessages();

        assert.equal(getTestValue(tree1), value);
        assert.equal(getTestValue(tree2), value);
    });

    it("creates revertibles for redoable commits", () => {

    });

    it("ignores undo and redo commits", () => {
    
    });

    it("can undo commits", () => {

    });

    it("can redo commits", () => {

    });

    it("can undo a redone commit", () => {

    });

    it("does not add remote commits to the undo stack", () => {

    });
});