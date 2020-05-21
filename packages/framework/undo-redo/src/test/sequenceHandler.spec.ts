/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as assert from "assert";
import { SharedString, SharedStringFactory } from "@fluidframework/sequence";
import { MockDeltaConnectionFactory, MockRuntime, MockStorage } from "@fluidframework/test-runtime-utils";
import { SharedSegmentSequenceUndoRedoHandler } from "../sequenceHandler";
import { UndoRedoStackManager } from "../undoRedoStackManager";

const text =
    // eslint-disable-next-line max-len
    "The SharedSegementSequenceRevertable does the heavy lifting of tracking and reverting changes on the underlying SharedSegementSequence. This is accomplished via TrackingGroup objects.";

function insertTextAsChunks(sharedString: SharedString, targetLength = text.length) {
    let chunks = 0;
    while (sharedString.getLength() < targetLength && sharedString.getLength() < text.length) {
        const len = sharedString.getLength() % 13 + 1;
        sharedString.insertText(
            sharedString.getLength(),
            text.substr(sharedString.getLength(), len));
        chunks++;
    }
    return chunks;
}
function deleteTextByChunk(sharedString: SharedString, targetLength = 0) {
    let chunks = 0;
    while (sharedString.getLength() > targetLength && sharedString.getLength() > 0) {
        const len = sharedString.getLength() % 17 + 1;
        sharedString.removeText(
            Math.max(sharedString.getLength() - len, 0),
            sharedString.getLength());
        chunks++;
    }
    return chunks;
}

describe("SharedSegmentSequenceUndoRedoHandler", () => {
    const documentId = "fakeId";
    let deltaConnectionFactory: MockDeltaConnectionFactory;
    let sharedString: SharedString;
    let undoRedoStack: UndoRedoStackManager;

    beforeEach(() => {
        const runtime = new MockRuntime();
        deltaConnectionFactory = new MockDeltaConnectionFactory();
        sharedString = new SharedString(runtime, documentId, SharedStringFactory.Attributes);
        runtime.services = {
            deltaConnection: deltaConnectionFactory.createDeltaConnection(runtime),
            objectStorage: new MockStorage(undefined),
        };
        runtime.attach();
        sharedString.initializeLocal();
        sharedString.register();

        undoRedoStack = new UndoRedoStackManager();
    });

    it("Undo and Redo Delete", () => {
        insertTextAsChunks(sharedString);
        const handler = new SharedSegmentSequenceUndoRedoHandler(undoRedoStack);
        handler.attachSequence(sharedString);

        deleteTextByChunk(sharedString);

        assert.equal(sharedString.getText(), "");

        while (undoRedoStack.undoOperation()) { }

        assert.equal(sharedString.getText(), text);

        while (undoRedoStack.redoOperation()) { }

        assert.equal(sharedString.getText(), "");
    });

    it("Undo and Redo Insert", () => {
        const handler = new SharedSegmentSequenceUndoRedoHandler(undoRedoStack);
        handler.attachSequence(sharedString);
        insertTextAsChunks(sharedString);

        assert.equal(sharedString.getText(), text);

        while (undoRedoStack.undoOperation()) { }

        assert.equal(sharedString.getText(), "");

        while (undoRedoStack.redoOperation()) { }

        assert.equal(sharedString.getText(), text);
    });

    it("Undo and Redo Insert & Delete", () => {
        const handler = new SharedSegmentSequenceUndoRedoHandler(undoRedoStack);
        handler.attachSequence(sharedString);
        for (let i = 1; i < text.length; i *= 2) {
            insertTextAsChunks(sharedString, text.length - i);
            deleteTextByChunk(sharedString, i);
        }
        const finalText = sharedString.getText();

        assert.equal(sharedString.getText(), finalText);

        while (undoRedoStack.undoOperation()) { }

        assert.equal(sharedString.getText(), "");

        while (undoRedoStack.redoOperation()) { }

        assert.equal(sharedString.getText(), finalText, sharedString.getText());
    });

    it("Undo and redo insert of split segment", () => {
        const handler = new SharedSegmentSequenceUndoRedoHandler(undoRedoStack);
        handler.attachSequence(sharedString);

        // insert all text as a single segment
        sharedString.insertText(0, text);

        deltaConnectionFactory.processAllMessages();

        // this will split that into three segment
        sharedString.walkSegments(
            () => true,
            20,
            30,
            undefined,
            true);

        assert.equal(sharedString.getText(), text);

        // undo and redo split insert
        undoRedoStack.undoOperation();
        undoRedoStack.redoOperation();

        assert.equal(sharedString.getText(), text);
    });
});
