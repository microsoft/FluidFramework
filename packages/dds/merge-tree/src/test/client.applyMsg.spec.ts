/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable @typescript-eslint/no-non-null-assertion */

import { strict as assert } from "assert";
import { ISequencedDocumentMessage } from "@fluidframework/protocol-definitions";
import { UnassignedSequenceNumber } from "../constants";
import { SegmentGroup } from "../mergeTreeNodes";
import { MergeTreeDeltaType } from "../ops";
import { TextSegment } from "../textSegment";
import { TestClient } from "./testClient";
import { createClientsAtInitialState, TestClientLogger } from "./testClientLogger";

describe("client.applyMsg", () => {
    const localUserLongId = "localUser";
    let client: TestClient;

    beforeEach(() => {
        client = new TestClient();
        client.insertTextLocal(0, "hello world");
        client.startOrUpdateCollaboration(localUserLongId);
    });

    it("Interleaved inserts, annotates, and deletes", () => {
        const changes =
            new Map<number, { msg: ISequencedDocumentMessage; segmentGroup?: SegmentGroup | SegmentGroup[]; }>();
        assert.equal(client.mergeTree.pendingSegments?.length, 0);
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
                    changes.set(i, { msg, segmentGroup: client.peekPendingSegmentGroups() });
                    break;
                }

                case 1:
                case 4: {
                    const str = `${i}`.repeat(imod6 + 5);
                    const msg = client.makeOpMessage(client.insertTextLocal(pos1, str), i + 1);
                    changes.set(i, { msg, segmentGroup: client.peekPendingSegmentGroups() });
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
                    changes.set(i, { msg, segmentGroup: client.peekPendingSegmentGroups() });
                    break;
                }
                default:
                    assert.fail("all cases should be handled");
            }
        }
        for (let i = 0; i < 100; i++) {
            const msg = changes.get(i)!.msg;
            client.applyMsg(msg);
            const segmentGroup = changes.get(i)?.segmentGroup;
            assert(!Array.isArray(segmentGroup) && segmentGroup !== undefined,
                "segment group should be defined and not an array");
            for (const seg of segmentGroup.segments) {
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
        assert.equal(client.mergeTree.pendingSegments?.length, 0);
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

        assert.equal(client.mergeTree.pendingSegments?.length, 1);

        client.applyMsg(client.makeOpMessage(op, 17));

        assert.equal(client.mergeTree.pendingSegments?.length, 0);
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

        assert.equal(client.mergeTree.pendingSegments?.length, 1);

        const removeOp = client.removeRangeLocal(start, end);

        assert.equal(segmentInfo.segment?.removedSeq, UnassignedSequenceNumber);
        assert.equal(client.mergeTree.pendingSegments?.length, 2);

        client.applyMsg(client.makeOpMessage(annotateOp, 17));

        assert.equal(segmentInfo.segment?.removedSeq, UnassignedSequenceNumber);
        assert.equal(client.mergeTree.pendingSegments?.length, 1);

        client.applyMsg(client.makeOpMessage(removeOp, 18));

        assert.equal(segmentInfo.segment?.removedSeq, 18);
        assert.equal(client.mergeTree.pendingSegments?.length, 0);
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
        assert.equal(client.mergeTree.pendingSegments?.length, messages.length);

        for (const msg of messages) {
            client.applyMsg(msg);
        }
        assert.equal(client.mergeTree.pendingSegments?.length, 0);
    });

    it("overlapping deletes", () => {
        const segmentInfo = client.getContainingSegment(0);

        const start = 0;
        const end = 5;
        const initialText = client.getText();
        const initialLength = initialText.length;

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
        assert.equal(client.getText(), initialText.substring(0, start) + initialText.substring(end));
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
        const clients = createClientsAtInitialState({ initialState: "" }, "A", "B", "C");
        let seq = 0;
        const logger = new TestClientLogger(clients.all);
        const messages = [
            clients.C.makeOpMessage(clients.C.insertTextLocal(0, "c"), ++seq),
            clients.C.makeOpMessage(clients.C.removeRangeLocal(0, 1), ++seq),
            clients.B.makeOpMessage(clients.B.insertTextLocal(0, "b"), ++seq),
            clients.C.makeOpMessage(clients.C.insertTextLocal(0, "c"), ++seq),
        ];

        while (messages.length > 0) {
            const msg = messages.shift()!;
            clients.all.forEach((c) => c.applyMsg(msg));
        }

        logger.validate();
    });

    it("conflicting insert after shared delete", () => {
        const clients = createClientsAtInitialState({ initialState: "Z" }, "A", "B", "C");
        let seq = 0;

        const logger = new TestClientLogger(clients.all);
        const messages = [
            clients.B.makeOpMessage(clients.B.insertTextLocal(0, "B"), ++seq),
            clients.C.makeOpMessage(clients.C.removeRangeLocal(0, clients.C.getLength()), ++seq),
            clients.C.makeOpMessage(clients.C.insertTextLocal(0, "C"), ++seq),
        ];

        while (messages.length > 0) {
            const msg = messages.shift()!;
            clients.all.forEach((c) => c.applyMsg(msg));
        }

        logger.validate();
    });

    it("local remove followed by conflicting insert", () => {
        const clients = createClientsAtInitialState({ initialState: "" }, "A", "B", "C");

        let seq = 0;

        const messages = [
            clients.C.makeOpMessage(clients.C.insertTextLocal(0, "c"), ++seq),
            clients.B.makeOpMessage(clients.B.insertTextLocal(0, "b"), ++seq),
            clients.C.makeOpMessage(clients.C.removeRangeLocal(0, 1), ++seq),
            clients.C.makeOpMessage(clients.C.insertTextLocal(0, "c"), ++seq),
        ];

        const logger = new TestClientLogger(clients.all);
        while (messages.length > 0) {
            const msg = messages.shift()!;
            clients.all.forEach((c) => c.applyMsg(msg));
        }

        logger.validate();
    });

    it("intersecting insert with un-acked insert and delete", () => {
        const clients = createClientsAtInitialState({ initialState: "" }, "A", "B", "C");

        let seq = 0;
        const messages = [
            clients.C.makeOpMessage(clients.C.insertTextLocal(0, "c"), ++seq),
            clients.B.makeOpMessage(clients.B.insertTextLocal(0, "bb"), ++seq),
            clients.B.makeOpMessage(clients.B.removeRangeLocal(0, 1), ++seq),
        ];

        const logger = new TestClientLogger(clients.all);
        while (messages.length > 0) {
            const msg = messages.shift()!;
            clients.all.forEach((c) => c.applyMsg(msg));
        }

        logger.validate();
    });

    it("conflicting insert over local delete", () => {
        const clients = createClientsAtInitialState({ initialState: "" }, "A", "B", "C");

        let seq = 0;
        const messages = [
            clients.C.makeOpMessage(clients.C.insertTextLocal(0, "CCC"), ++seq),
            clients.C.makeOpMessage(clients.C.removeRangeLocal(0, 1), ++seq),

        ];
        while (messages.length > 0) {
            const msg = messages.shift()!;
            clients.all.forEach((c) => {
                c.applyMsg(msg);
            });
        }
        const logger = new TestClientLogger(clients.all);
        logger.validate();

        messages.push(
            clients.C.makeOpMessage(clients.C.removeRangeLocal(0, 1), ++seq),
            clients.C.makeOpMessage(clients.C.insertTextLocal(0, "CC"), ++seq),
            clients.B.makeOpMessage(clients.B.insertTextLocal(1, "BBB"), ++seq),
        );
        while (messages.length > 0) {
            const msg = messages.shift()!;
            clients.all.forEach((c) => c.applyMsg(msg));
        }
        logger.validate();
    });

    it("Local insert after acked local delete", () => {
        const clients = createClientsAtInitialState(
            { initialState: "ZZ", options: { mergeTreeUseNewLengthCalculations: true } },
            "A", "B", "C");

        const logger = new TestClientLogger(clients.all);

        let seq = 0;

        const op1 = clients.C.makeOpMessage(clients.C.removeRangeLocal(0, 1), ++seq);
        clients.C.applyMsg(op1);

        const op2 = clients.B.makeOpMessage(clients.B.removeRangeLocal(1, 2), ++seq);

        const op3 = clients.C.makeOpMessage(clients.C.insertTextLocal(0, "C"), ++seq);

        const op4 = clients.B.makeOpMessage(clients.B.insertTextLocal(1, "B"), ++seq);

        clients.A.applyMsg(op1);
        clients.B.applyMsg(op1);

        const messages = [op2, op3, op4];
        while (messages.length > 0) {
            const msg = messages.shift()!;
            clients.all.forEach((c) => c.applyMsg(msg));
        }

        logger.validate();
    });

    it("Remote Remove before conflicting insert", () => {
        const clients = createClientsAtInitialState({ initialState: "Z" }, "A", "B", "C");

        const logger = new TestClientLogger(clients.all);

        let seq = 0;

        const op1 = clients.B.makeOpMessage(clients.B.removeRangeLocal(0, 1), ++seq);
        const op2 = clients.B.makeOpMessage(clients.B.insertTextLocal(0, "B"), ++seq);

        clients.C.applyMsg(op1);

        const op3 = clients.C.makeOpMessage(clients.C.insertTextLocal(0, "C"), ++seq);
        clients.A.applyMsg(op1);
        clients.B.applyMsg(op1);

        const messages = [op2, op3];
        while (messages.length > 0) {
            const msg = messages.shift()!;
            clients.all.forEach((c) => c.applyMsg(msg));
        }

        logger.validate();
    });

    it("Conflicting inserts at deleted segment position", () => {
        const clients = createClientsAtInitialState({ initialState: "a----bcd-ef" }, "A", "B", "C");

        const logger = new TestClientLogger(clients.all);

        let seq = 0;
        const ops: ISequencedDocumentMessage[] = [];
        ops.push(clients.B.makeOpMessage(clients.B.insertTextLocal(4, "B"), ++seq));
        ops.push(clients.C.makeOpMessage(clients.C.insertTextLocal(4, "CC"), ++seq));
        ops.push(clients.C.makeOpMessage(clients.C.removeRangeLocal(2, 8), ++seq));
        clients.B.applyMsg(ops[0]);
        clients.B.applyMsg(ops[1]);
        ops.push(clients.B.makeOpMessage(clients.B.removeRangeLocal(5, 8), ++seq));

        for (const op of ops) {
            clients.all.forEach(
                (c) => {
                    if (c.getCollabWindow().currentSeq < op.sequenceNumber) {
                        c.applyMsg(op);
                    }
                });
        }
        logger.validate();
    });

    it("Inconsistent shared string after pausing connection #9703", () => {
        const clients = createClientsAtInitialState(
            { initialState: "abcd", options: { mergeTreeUseNewLengthCalculations: true } },
             "A", "B", "C");

        const logger = new TestClientLogger(clients.all);

        let seq = 0;
        const ops: ISequencedDocumentMessage[] = [];
        ops.push(clients.B.makeOpMessage(clients.B.removeRangeLocal(1, 3), ++seq));
        clients.B.applyMsg(ops[0]);
        ops.push(clients.B.makeOpMessage(clients.B.insertTextLocal(1, "yz"), ++seq));
        clients.B.applyMsg(ops[1]);

        // its like this connection is paused, as it doesn't see the other clients ops
        // which it's own ops will be sequenced after
        ops.push(clients.C.makeOpMessage(clients.C.insertTextLocal(2, "X"), ++seq));

        for (const op of ops) {
            clients.all.forEach(
                (c) => {
                    if (c.getCollabWindow().currentSeq < op.sequenceNumber) {
                        c.applyMsg(op);
                    }
                });
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
