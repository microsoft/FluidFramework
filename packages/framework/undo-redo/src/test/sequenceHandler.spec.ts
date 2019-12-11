/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { SharedString } from "@microsoft/fluid-sequence";
import { MockDeltaConnectionFactory, MockRuntime, MockStorage } from "@microsoft/fluid-test-runtime-utils";
import * as assert from "assert";
import { SharedSegmentSequenceUndoRedoHandler } from "../sequenceHandler";
import { UndoRedoStackManager } from "../undoRedoStackManager";

const text =
    // tslint:disable-next-line: max-line-length
    "The SharedSegementSequenceRevertable does the heavy lifting of tracking and reverting changes on the underlying SharedSegementSequence. This is accomplished via TrackingGroup objects. A TrackingGroup creates a bi-direction link between itself and the segment. This link is maintained across segment movement, splits, merges, and removal. When a sequence delta event is fired the segments contained in that event are added to a TrackingGroup. The TrackingGroup is then tracked along with additional metadata, like the delta type and the annotate property changes. From the TrackingGroup's segments we can find the ranges in the current document that were affected by the original change even in the presesene of other changes. The segments also contain the content which can be used. With the ranges, content, and metadata we can revert the original change on the sequence.";

function insertText(sharedString: SharedString, targetLength = text.length) {
    while (sharedString.getLength() < targetLength && sharedString.getLength() < text.length) {
        const len = sharedString.getLength() % 13 + 1;
        sharedString.insertText(
            sharedString.getLength(),
            text.substr(sharedString.getLength(), len));
    }
}
function deleteText(sharedString: SharedString, targetLength = 0) {
    while (sharedString.getLength() > targetLength && sharedString.getLength() > 0) {
        const len = sharedString.getLength() % 13 + 1;
        sharedString.removeText(
            Math.min(sharedString.getLength() - len, 0),
            sharedString.getLength());
    }
}

describe("SharedSegmentSequenceUndoRedoHandler", () => {
    const documentId = "fakeId";
    let deltaConnectionFactory: MockDeltaConnectionFactory;
    let sharedString: SharedString;
    let undoRedoStack: UndoRedoStackManager;

    beforeEach(() => {
        const runtime = new MockRuntime();
        deltaConnectionFactory = new MockDeltaConnectionFactory();
        sharedString = new SharedString(runtime, documentId);
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
        insertText(sharedString);
        const handler = new SharedSegmentSequenceUndoRedoHandler(undoRedoStack);
        handler.attachSequence(sharedString);

        deleteText(sharedString);

        for (let i = 0; i < 10; i++) {
            assert.equal(sharedString.getText(), "");
            while (undoRedoStack.undoOperation()) { }
            assert.equal(sharedString.getText(), text);
            while (undoRedoStack.redoOperation()) { }
            assert.equal(sharedString.getText(), "");
        }
    });

    it("Undo and Redo Insert", () => {
        const handler = new SharedSegmentSequenceUndoRedoHandler(undoRedoStack);
        handler.attachSequence(sharedString);
        insertText(sharedString);

        for (let i = 0; i < 10; i++) {
            assert.equal(sharedString.getText(), text);
            while (undoRedoStack.undoOperation()) { }
            assert.equal(sharedString.getText(), "");
            while (undoRedoStack.redoOperation()) { }
            assert.equal(sharedString.getText(), text);
        }
    });

    it("Undo and Redo Insert & Delete", () => {
        const handler = new SharedSegmentSequenceUndoRedoHandler(undoRedoStack);
        handler.attachSequence(sharedString);
        for (let i = 1; i < text.length; i *= 2) {
            insertText(sharedString, text.length - i);
            deleteText(sharedString, i);
        }
        const finalText = sharedString.getText();

        for (let i = 0; i < 10; i++) {
            assert.equal(sharedString.getText(), finalText);
            while (undoRedoStack.undoOperation()) { }
            assert.equal(sharedString.getText(), "");
            while (undoRedoStack.redoOperation()) { }
            assert.equal(sharedString.getText(), finalText);
        }
    });
});
