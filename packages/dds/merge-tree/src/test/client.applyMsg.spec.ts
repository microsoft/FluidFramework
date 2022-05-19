/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable @typescript-eslint/no-non-null-assertion */

import { strict as assert } from "assert";
import { ISequencedDocumentMessage } from "@fluidframework/protocol-definitions";
import { UnassignedSequenceNumber } from "../constants";
import { SegmentGroup } from "../mergeTree";
import { MergeTreeDeltaType } from "../ops";
import { TextSegment } from "../textSegment";
import { TestClient } from "./testClient";
import { TestClientLogger } from "./testClientLogger";

describe("client.applyMsg", () => {
    const localUserLongId = "localUser";
    let client: TestClient;

    beforeEach(() => {
        client = new TestClient();
        client.insertTextLocal(0, "hello world");
        client.startOrUpdateCollaboration(localUserLongId);
    });

    it("Interleaved inserts, annotates, and deletes", () => {
        const changes = new Map<number, { msg: ISequencedDocumentMessage; segmentGroup: SegmentGroup; }>();
        assert.equal(client.mergeTree.pendingSegments?.count(), 0);
        for (let i = 0; i < 100; i++) {
            const len = client.getLength();
            const pos1 = Math.floor(len / 2);
            const imod6 = i % 6;
            switch (imod6) {
                case 0:
                case 5: {
                    const pos2 = Math.max(Math.floor((len - pos1) / 4) - imod6 + pos1, pos1 + 1);
                    const msg = client.makeOpMessage(
                        client.removeRangeLocal(pos1, pos2),
                        i + 1);
                    changes.set(i, { msg, segmentGroup: client.mergeTree.pendingSegments.last()! });
                    break;
                }

                case 1:
                case 4: {
                    const str = `${i}`.repeat(imod6 + 5);
                    const msg = client.makeOpMessage(client.insertTextLocal(pos1, str), i + 1);
                    changes.set(i, { msg, segmentGroup: client.mergeTree.pendingSegments.last()! });
                    break;
                }

                case 2:
                case 3: {
                    const pos2 = Math.max(Math.floor((len - pos1) / 3) - imod6 + pos1, pos1 + 1);
                    const op = client.annotateRangeLocal(
                        pos1,
                        pos2,
                        {
                            foo: `${i}`,
                        },
                        undefined);
                    const msg = client.makeOpMessage(op, i + 1);
                    changes.set(i, { msg, segmentGroup: client.mergeTree.pendingSegments.last()! });
                    break;
                }
                default:
                    assert.fail("all cases should be handled");
            }
        }
        for (let i = 0; i < 100; i++) {
            const msg = changes.get(i)!.msg;
            client.applyMsg(msg);
            const segments = changes.get(i)!.segmentGroup.segments;
            for (const seg of segments) {
                switch (i % 6) {
                    case 0:
                    case 5:
                        assert.equal(seg.removedSeq, msg.sequenceNumber, "removed segment has unexpected id");
                        break;

                    case 1:
                    case 4:
                        assert.equal(seg.seq, msg.sequenceNumber, "inserted segment has unexpected id");
                        break;

                    default:
                }
            }
        }
        assert.equal(client.mergeTree.pendingSegments?.count(), 0);
        for (let i = 0; i < client.getText().length; i++) {
            const segmentInfo = client.getContainingSegment(i);

            assert.notEqual(segmentInfo.segment?.seq, UnassignedSequenceNumber, "all segments should be acked");
            assert(segmentInfo.segment?.segmentGroups.empty, "there should be no outstanding segmentGroups");
        }
    });

    it("insertTextLocal", () => {
        const op = client.insertTextLocal(0, "abc");

        const segmentInfo = client.getContainingSegment(0);

        assert.equal(segmentInfo.segment?.seq, UnassignedSequenceNumber);

        client.applyMsg(client.makeOpMessage(op, 17));

        assert.equal(segmentInfo.segment?.seq, 17);
    });

    it("removeRangeLocal", () => {
        const segmentInfo = client.getContainingSegment(0);

        const removeOp = client.removeRangeLocal(0, 1);

        assert.equal(segmentInfo.segment?.removedSeq, UnassignedSequenceNumber);

        client.applyMsg(client.makeOpMessage(removeOp, 17));

        assert.equal(segmentInfo.segment?.removedSeq, 17);
    });

    it("annotateSegmentLocal", () => {
        const props = {
            foo: "bar",
        };
        const op = client.annotateRangeLocal(
            0,
            1,
            props,
            undefined);

        assert.equal(client.mergeTree.pendingSegments?.count(), 1);

        client.applyMsg(client.makeOpMessage(op, 17));

        assert.equal(client.mergeTree.pendingSegments?.count(), 0);
    });

    it("annotateSegmentLocal then removeRangeLocal", () => {
        const segmentInfo = client.getContainingSegment(0);

        const start = 0;
        const end = client.getText().length;

        const props = {
            foo: "bar",
        };

        const annotateOp = client.annotateRangeLocal(
            start,
            end,
            props,
            undefined);

        assert.equal(client.mergeTree.pendingSegments?.count(), 1);

        const removeOp = client.removeRangeLocal(start, end);

        assert.equal(segmentInfo.segment?.removedSeq, UnassignedSequenceNumber);
        assert.equal(client.mergeTree.pendingSegments?.count(), 2);

        client.applyMsg(client.makeOpMessage(annotateOp, 17));

        assert.equal(segmentInfo.segment?.removedSeq, UnassignedSequenceNumber);
        assert.equal(client.mergeTree.pendingSegments?.count(), 1);

        client.applyMsg(client.makeOpMessage(removeOp, 18));

        assert.equal(segmentInfo.segment?.removedSeq, 18);
        assert.equal(client.mergeTree.pendingSegments?.count(), 0);
    });

    it("multiple interleaved annotateSegmentLocal", () => {
        let annotateEnd: number = client.getText().length;
        const messages: ISequencedDocumentMessage[] = [];
        let sequenceNumber = 0;
        while (annotateEnd > 0) {
            const props = {
                end: annotateEnd,
                foo: "bar",
            };
            const annotateOp = client.annotateRangeLocal(
                0,
                annotateEnd,
                props,
                undefined);

            messages.push(
                client.makeOpMessage(
                    annotateOp,
                    ++sequenceNumber));

            annotateEnd = Math.floor(annotateEnd / 2);
        }
        assert.equal(client.mergeTree.pendingSegments?.count(), messages.length);

        for (const msg of messages) {
            client.applyMsg(msg);
        }
        assert.equal(client.mergeTree.pendingSegments?.count(), 0);
    });

    it("overlapping deletes", () => {
        const segmentInfo = client.getContainingSegment(0);

        const start = 0;
        const end = 5;
        const intialText = client.getText();
        const initialLength = intialText.length;

        assert.equal(segmentInfo.segment?.removedSeq, undefined);
        assert(segmentInfo.segment?.segmentGroups.empty);

        const removeOp = client.removeRangeLocal(start, end);

        assert.equal(segmentInfo.segment?.removedSeq, UnassignedSequenceNumber);
        assert.equal(segmentInfo.segment?.segmentGroups.size, 1);

        const remoteMessage = client.makeOpMessage(removeOp, 17);
        remoteMessage.clientId = "remoteClient";

        client.applyMsg(remoteMessage);

        assert.equal(segmentInfo.segment?.removedSeq, remoteMessage.sequenceNumber);
        assert.equal(segmentInfo.segment?.segmentGroups.size, 1);

        client.applyMsg(client.makeOpMessage(removeOp, 18));

        assert.equal(segmentInfo.segment?.removedSeq, remoteMessage.sequenceNumber);
        assert(segmentInfo.segment?.segmentGroups.empty);
        assert.equal(client.getLength(), initialLength - (end - start));
        assert.equal(client.getText(), intialText.substring(0, start) + intialText.substring(end));
    });

    it("overlapping insert and delete", () => {
        const remoteClient = new TestClient();
        remoteClient.insertTextLocal(0, client.getText());
        remoteClient.startOrUpdateCollaboration("remoteUser");
        const clients = [client, remoteClient];
        const logger = new TestClientLogger(clients);
        let seq = 0;
        const initialMsg = client.makeOpMessage(client.insertTextLocal(0, "-"), ++seq);

        clients.forEach((c) => c.applyMsg(initialMsg));
        logger.validate();

        const messages = [
            client.makeOpMessage(client.insertTextLocal(0, "L"), ++seq),
            client.makeOpMessage(client.removeRangeLocal(1, 2), ++seq),
            remoteClient.makeOpMessage(remoteClient.insertTextLocal(0, "R"), ++seq),
            remoteClient.makeOpMessage(remoteClient.removeRangeLocal(1, 2), ++seq),
        ];

        while (messages.length > 0) {
            const msg = messages.shift()!;
            clients.forEach((c) => c.applyMsg(msg));
        }

        logger.validate();
    });

    it("intersecting insert after local delete", () => {
        const clientA = new TestClient();
        clientA.startOrUpdateCollaboration("A");
        const clientB = new TestClient();
        clientB.startOrUpdateCollaboration("B");
        const clientC = new TestClient();
        clientC.startOrUpdateCollaboration("C");

        const clients = [clientA, clientB, clientC];

        let seq = 0;

        const messages = [
            clientC.makeOpMessage(clientC.insertTextLocal(0, "c"), ++seq),
            clientC.makeOpMessage(clientC.removeRangeLocal(0, 1), ++seq),
            clientB.makeOpMessage(clientB.insertTextLocal(0, "b"), ++seq),
            clientC.makeOpMessage(clientC.insertTextLocal(0, "c"), ++seq),
        ];

        const logger = new TestClientLogger(clients);
        while (messages.length > 0) {
            const msg = messages.shift()!;
            clients.forEach((c) => c.applyMsg(msg));
        }

        logger.validate();
    });

    it("conflicting insert after shared delete", () => {
        const clientA = new TestClient();
        clientA.insertTextLocal(0, "a");
        clientA.startOrUpdateCollaboration("A");
        const clientB = new TestClient();
        clientB.insertTextLocal(0, clientA.getText());
        clientB.startOrUpdateCollaboration("B");
        const clientC = new TestClient();
        clientC.insertTextLocal(0, clientA.getText());
        clientC.startOrUpdateCollaboration("C");

        const clients = [clientA, clientB, clientC];
        let seq = 0;

        const messages = [
            clientB.makeOpMessage(clientB.insertTextLocal(0, "b"), ++seq),
            clientC.makeOpMessage(clientC.removeRangeLocal(0, clientC.getLength()), ++seq),
            clientC.makeOpMessage(clientC.insertTextLocal(0, "c"), ++seq),
        ];

        const logger = new TestClientLogger(clients);
        while (messages.length > 0) {
            const msg = messages.shift()!;
            clients.forEach((c) => c.applyMsg(msg));
        }

        logger.validate();
    });

    it("local remove followed by conflicting insert", () => {
        const clientA = new TestClient();
        clientA.startOrUpdateCollaboration("A");
        const clientB = new TestClient();
        clientB.startOrUpdateCollaboration("B");
        const clientC = new TestClient();
        clientC.startOrUpdateCollaboration("C");

        const clients = [clientA, clientB, clientC];
        let seq = 0;

        const messages = [
            clientC.makeOpMessage(clientC.insertTextLocal(0, "c"), ++seq),
            clientB.makeOpMessage(clientB.insertTextLocal(0, "b"), ++seq),
            clientC.makeOpMessage(clientC.removeRangeLocal(0, 1), ++seq),
            clientC.makeOpMessage(clientC.insertTextLocal(0, "c"), ++seq),
        ];

        const logger = new TestClientLogger(clients);
        while (messages.length > 0) {
            const msg = messages.shift()!;
            clients.forEach((c) => c.applyMsg(msg));
        }

        logger.validate();
    });

    it("intersecting insert with un-acked insert and delete", () => {
        const clientA = new TestClient();
        clientA.startOrUpdateCollaboration("A");
        const clientB = new TestClient();
        clientB.startOrUpdateCollaboration("B");
        const clientC = new TestClient();
        clientC.startOrUpdateCollaboration("C");

        const clients = [clientA, clientB, clientC];
        let seq = 0;
        const messages = [
            clientC.makeOpMessage(clientC.insertTextLocal(0, "c"), ++seq),
            clientB.makeOpMessage(clientB.insertTextLocal(0, "bb"), ++seq),
            clientB.makeOpMessage(clientB.removeRangeLocal(0, 1), ++seq),
        ];

        const logger = new TestClientLogger(clients);
        while (messages.length > 0) {
            const msg = messages.shift()!;
            clients.forEach((c) => c.applyMsg(msg));
        }

        logger.validate();
    });

    it("conflicting insert over local delete", () => {
        const clientA = new TestClient();
        clientA.startOrUpdateCollaboration("A");
        const clientB = new TestClient();
        clientB.startOrUpdateCollaboration("B");
        const clientC = new TestClient();
        clientC.startOrUpdateCollaboration("C");

        const clients = [clientA, clientB, clientC];

        let seq = 0;
        const messages = [
            clientC.makeOpMessage(clientC.insertTextLocal(0, "CCC"), ++seq),
            clientC.makeOpMessage(clientC.removeRangeLocal(0, 1), ++seq),

        ];
        while (messages.length > 0) {
            const msg = messages.shift()!;
            clients.forEach((c) => {
                c.applyMsg(msg);
            });
        }
        const logger = new TestClientLogger(clients);
        logger.validate();

        messages.push(
            clientC.makeOpMessage(clientC.removeRangeLocal(0, 1), ++seq),
            clientC.makeOpMessage(clientC.insertTextLocal(0, "CC"), ++seq),
            clientB.makeOpMessage(clientB.insertTextLocal(1, "BBB"), ++seq),
        );
        while (messages.length > 0) {
            const msg = messages.shift()!;
            clients.forEach((c) => c.applyMsg(msg));
        }
        logger.validate();
    });

    it("regenerate annotate op over removed range", () => {
        const clientA = new TestClient();
        clientA.startOrUpdateCollaboration("A");
        const clientB = new TestClient();
        clientB.startOrUpdateCollaboration("B");

        let seq = 0;
        const insertOp = clientA.makeOpMessage(clientA.insertTextLocal(0, "AAA"), ++seq);
        [clientA, clientB].map((c) => c.applyMsg(insertOp));

        const annotateOp = clientA.annotateRangeLocal(0, clientA.getLength(), { client: "A" }, undefined)!;
        const seg = clientA.peekPendingSegmentGroups()!;

        const removeOp = clientB.makeOpMessage(clientB.removeRangeLocal(0, clientB.getLength()), ++seq);
        [clientA, clientB].map((c) => c.applyMsg(removeOp));

        const regeneratedOp = clientA.regeneratePendingOp(annotateOp, seg);
        assert(regeneratedOp.type === MergeTreeDeltaType.GROUP);
        assert.strictEqual(regeneratedOp.ops.length, 0);
    });

    it("getContainingSegment with op", () => {
        const clientA = new TestClient();
        clientA.startOrUpdateCollaboration("A");
        const clientB = new TestClient();
        clientB.startOrUpdateCollaboration("B");

        let seq = 0;
        const insertOp1 = clientA.makeOpMessage(clientA.insertTextLocal(0, "ABC"), ++seq);
        [clientA, clientB].map((c) => c.applyMsg(insertOp1));

        const removeOp = clientA.removeRangeLocal(0, 2);
        const removeSequence = ++seq;
        clientA.applyMsg(clientA.makeOpMessage(removeOp, removeSequence));

        const insertOp2 = clientB.insertTextLocal(2, "X");

        // op with no reference sequence should count removed segment
        const insertMessage2 = clientB.makeOpMessage(insertOp2, ++seq);
        let seg = clientA.getContainingSegment(2, insertMessage2);
        assert.notStrictEqual(seg.segment, undefined);
        assert.strictEqual((seg.segment as TextSegment).text, "C");

        // op with reference sequence >= remove op sequence should not count removed segment
        const insertMessage3 = clientB.makeOpMessage(insertOp2, seq, removeSequence);
        seg = clientA.getContainingSegment(2, insertMessage3);
        assert.strictEqual(seg.segment, undefined);
    });
});
