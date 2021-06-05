/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { TextSegment } from "../";
import { createInsertSegmentOp, createRemoveRangeOp } from "../opBuilder";
import { TestClient } from "./testClient";
import { TestClientLogger } from "./testClientLogger";

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
    it("local and remote clients race to insert at position of removed segment", () => {
        // Note: This test constructs it's own TestClients to avoid being initialized with "hello world".

        // First we run through the ops from the perspective of a passive observer (i.e., all operations are remote).
        const clientA = new TestClient();
        clientA.startOrUpdateCollaboration("A");

        // Next, we run through the same sequence from the perspective of clients B & C:
        const clientB = new TestClient();
        clientB.startOrUpdateCollaboration("B");
        const clientC = new TestClient();
        clientC.startOrUpdateCollaboration("C");

        const clients = [clientA, clientB, clientC];
        const logger = new TestClientLogger(clients);
        let seq = 0;

        // Client B locally inserts and removes the letter "a".
        const op1 = clientB.makeOpMessage(clientB.insertTextLocal(0, "a"), ++seq);
        logger.log(op1);
        const op2 = clientB.makeOpMessage(clientB.removeRangeLocal(0, 1), ++seq);
        logger.log(op2);

        // In parallel to Client B, client C inserts the letter "X"
        const op3 = clientC.makeOpMessage(clientC.insertTextLocal(0, "X"), ++seq);
        logger.log(op3);

        // All clients B receives ACKs for op1 and op2.
        logger.log(op1, (c)=>c.applyMsg(op1));
        logger.log(op2, (c)=>c.applyMsg(op2));

        // Client B locally inserts "c".
        const op4 = clientB.makeOpMessage(clientB.insertTextLocal(0, "c"), ++seq);
        logger.log(op4);

        // All clients then processes the parallel insertion of "X" from Client C at refSeq=0
        logger.log(op3, (c)=>c.applyMsg(op3));

        // Finally, All clients receives the ack for its insertion of "c".
        logger.log(op4, (c)=>c.applyMsg(op4));
        logger.validate();
    });
});
