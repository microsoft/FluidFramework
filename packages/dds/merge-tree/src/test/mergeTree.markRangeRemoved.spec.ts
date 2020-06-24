/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "assert";
import { TextSegment } from "../";
import { createInsertSegmentOp, createRemoveRangeOp } from "../opBuilder";
import { TestClient } from "./testClient";

describe("MergeTree.markRangeRemoved", () => {
    let client: TestClient;
    beforeEach(() => {
        client = new TestClient();
        client.startOrUpdateCollaboration("local");
        for (const char of "hello world") {
            client.applyMsg(
                client.makeOpMessage(
                    client.insertTextLocal(client.getLength(), char),
                    client.getCurrentSeq() + 1));
        }
        assert.equal(client.getText(), "hello world");
    });

    it("local remove followed by local insert", () => {
        client.removeRangeLocal(0, client.getLength());
        assert.equal(client.getText(), "");

        client.insertTextLocal(0, "text");
        assert.equal(client.getText(), "text");
    });

    it("local insert followed by local remove", () => {
        client.insertTextLocal(0, "text");
        assert.equal(client.getText(), "texthello world");

        client.removeRangeLocal(0, client.getLength());
        assert.equal(client.getText(), "");
    });

    it("remote remove followed by local insert", () => {
        client.applyMsg(
            client.makeOpMessage(
                createRemoveRangeOp(0, client.getLength()),
                client.mergeTree.collabWindow.currentSeq + 1,
                client.mergeTree.collabWindow.currentSeq,
                "remote"));

        assert.equal(client.getText(), "");

        client.insertTextLocal(0, "text");
        assert.equal(client.getText(), "text");
    });

    it("local remove followed by remote insert", () => {
        client.removeRangeLocal(0, client.getLength());
        assert.equal(client.getText(), "");

        client.applyMsg(
            client.makeOpMessage(
                createInsertSegmentOp(0, TextSegment.make("text")),
                client.mergeTree.collabWindow.currentSeq + 1,
                client.mergeTree.collabWindow.currentSeq,
                "remote"));

        assert.equal(client.getText(), "text");
    });

    it("remote remove followed by remote insert", () => {
        const removeMsg =
            client.makeOpMessage(
                createRemoveRangeOp(0, client.getLength()),
                client.mergeTree.collabWindow.currentSeq + 1,
                client.mergeTree.collabWindow.currentSeq,
                "remote2");

        const insertMsg =
            client.makeOpMessage(
                createInsertSegmentOp(0, TextSegment.make("text")),
                client.mergeTree.collabWindow.currentSeq + 2,
                client.mergeTree.collabWindow.currentSeq,
                "remote");

        client.applyMsg(removeMsg);
        client.applyMsg(insertMsg);

        assert.equal(client.getText(), "text");
    });

    it("remote insert followed by remote remove", () => {
        const insertMsg =
            client.makeOpMessage(
                createInsertSegmentOp(0, TextSegment.make("text")),
                client.mergeTree.collabWindow.currentSeq + 1,
                client.mergeTree.collabWindow.currentSeq,
                "remote");

        const removeMsg =
            client.makeOpMessage(
                createRemoveRangeOp(0, client.getLength()),
                client.mergeTree.collabWindow.currentSeq + 2,
                client.mergeTree.collabWindow.currentSeq,
                "remote2");

        client.applyMsg(insertMsg);
        client.applyMsg(removeMsg);

        assert.equal(client.getText(), "text");
    });

    // Repro of issue #1213:
    // https://github.com/microsoft/FluidFramework/issues/1214
    it.skip("local and remote clients race to insert at position of removed segment", () => {
        // Note: This test constructs it's own TestClients to avoid being initialized with "hello world".

        // First we run through the ops from the perspective of a passive observer (i.e., all operations are remote).
        const expected = new TestClient();
        expected.startOrUpdateCollaboration("3");

        {
            let seq = 0;

            // Client 1 locally inserts and removes the letter "a".
            expected.insertTextRemote(0, "a", undefined, ++seq, /* refSeq: */ 0, /* longClientId: */ "1");
            expected.removeRangeRemote(0, 1, ++seq, /* refSeq: */ 0, /* longClientId: */ "1");
            const refSeqAt2 = expected.getCurrentSeq();

            // In parallel, Client 2 inserted "x" without knowledge of Client 1's insertion/removal.
            expected.insertTextRemote(0, "X", undefined, ++seq, /* refSeq: */ 0, /* longClientId: */ "2");

            // Client 1 inserts "c" having received acks for its own edits, but has not yet having
            // observed the insertion of "X" from client 2.
            expected.insertTextRemote(0, "c", undefined, ++seq, refSeqAt2,         /* longClientId: */ "1");
        }

        // Next, we run through the same sequence from the perspective of client 1:
        const actual = new TestClient();
        actual.startOrUpdateCollaboration("1");

        {
            let seq = 0;

            // Client 1 locally inserts and removes the letter "a".
            const op1 = actual.insertTextLocal(0, "a");
            const op2 = actual.removeRangeLocal(0, 1);

            // Client 1 receives ACKs for op1 and op2.
            actual.applyMsg(actual.makeOpMessage(op1, ++seq, /* refSeq: */ 0));
            actual.applyMsg(actual.makeOpMessage(op2, ++seq, /* refSeq: */ 0));
            const refSeqAt2 = actual.getCurrentSeq();

            // Client 1 locally inserts "c".
            const op4 = actual.insertTextLocal(0, "c");

            // Client 1 then processes the parallel insertion of "X" from Client 2 at refSeq=0
            actual.insertTextRemote(0, "X", undefined, ++seq, /* refSeq: */ 0, /* longClientId: */ "2");

            // Finally, client 1 receives the ack for its insertion of "c".
            actual.applyMsg(actual.makeOpMessage(op4, ++seq, refSeqAt2));
        }

        assert.equal(actual.getText(), expected.getText());
    });
});
