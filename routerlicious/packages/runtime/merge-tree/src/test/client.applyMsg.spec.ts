import { ISequencedDocumentMessage } from "@prague/container-definitions";
import * as assert from "assert";
import { SegmentGroup, UnassignedSequenceNumber } from "..";
import { TestClient } from "./testClient";

describe("client.applyMsg", () => {
    const localUserLongId = "localUser";
    let client: TestClient;

    beforeEach(() => {
        client = new TestClient("hello world");

        client.startCollaboration(localUserLongId);
    });

    it("Interleaved inserts, annotates, and deletes", () => {
        const changes = new Map<number, { msg: ISequencedDocumentMessage, segmentGroup: SegmentGroup }>();
        assert.equal(client.mergeTree.pendingSegments.count(), 0);
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
                    changes.set(i, { msg, segmentGroup: client.mergeTree.pendingSegments.last() });
                    break;
                }

                case 1:
                case 4: {
                    const str = `${i}`.repeat(imod6 + 5);
                    const msg = client.makeOpMessage(client.insertTextLocal(pos1, str), i + 1);
                    changes.set(i, {msg, segmentGroup: client.mergeTree.pendingSegments.last()});
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
                    changes.set(i, { msg, segmentGroup: { segments: [] } });
                    break;
                }
                default:
                    assert.fail("all cases should be handled");
            }
        }
        for (let i = 0; i < 100; i++) {
            const msg = changes.get(i).msg;
            client.applyMsg(msg);
            const segments = changes.get(i).segmentGroup.segments;
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
        assert.equal(client.mergeTree.pendingSegments.count(), 0);
        for (let i = 0; i < client.getText().length; i++) {
            const segmentInfo =
                client.mergeTree.getContainingSegment(i, client.getCurrentSeq(), client.getClientId());

            assert.notEqual(segmentInfo.segment.seq, UnassignedSequenceNumber, "all segments should be acked");
            assert(segmentInfo.segment.segmentGroups.empty, "there should be no outstanding segmentGroups");
        }
    });

    it("insertTextLocal", () => {

        const op = client.insertTextLocal(0, "abc");

        const segmentInfo =
            client.mergeTree.getContainingSegment(0, client.getCurrentSeq(), client.getClientId());

        assert.equal(segmentInfo.segment.seq, UnassignedSequenceNumber);

        client.applyMsg(client.makeOpMessage(op, 17));

        assert.equal(segmentInfo.segment.seq, 17);
    });

    it("removeRangeLocal", () => {
        const segmentInfo =
            client.mergeTree.getContainingSegment(0, client.getCurrentSeq(), client.getClientId());

        const removeOp = client.removeRangeLocal(0, 1);

        assert.equal(segmentInfo.segment.removedSeq, UnassignedSequenceNumber);

        client.applyMsg(client.makeOpMessage(removeOp, 17));

        assert.equal(segmentInfo.segment.removedSeq, 17);
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

        client.applyMsg(client.makeOpMessage(op, 17));

        assert.equal(client.mergeTree.pendingSegments.count(), 0);
    });

    it("annotateSegmentLocal then removeRangeLocal", () => {
        const segmentInfo =
            client.mergeTree.getContainingSegment(0, client.getCurrentSeq(), client.getClientId());

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

        assert.equal(client.mergeTree.pendingSegments.count(), 0);

        const removeOp = client.removeRangeLocal(start, end);

        assert.equal(segmentInfo.segment.removedSeq, UnassignedSequenceNumber);
        assert.equal(client.mergeTree.pendingSegments.count(), 1);

        client.applyMsg(client.makeOpMessage(annotateOp, 17));

        assert.equal(segmentInfo.segment.removedSeq, UnassignedSequenceNumber);
        assert.equal(client.mergeTree.pendingSegments.count(), 1);

        client.applyMsg(client.makeOpMessage(removeOp, 18));

        assert.equal(segmentInfo.segment.removedSeq, 18);
        assert.equal(client.mergeTree.pendingSegments.count(), 0);
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
        assert.equal(client.mergeTree.pendingSegments.count(), 0);

        for (const msg of messages) {
            client.applyMsg(msg);
        }
        assert.equal(client.mergeTree.pendingSegments.count(), 0);
    });

    it("overlapping deletes", () => {
        const segmentInfo =
            client.mergeTree.getContainingSegment(0, client.getCurrentSeq(), client.getClientId());

        const start = 0;
        const end = 5;
        const intialText = client.getText();
        const initalLength = intialText.length;

        assert.equal(segmentInfo.segment.removedSeq, undefined);
        assert(segmentInfo.segment.segmentGroups.empty);

        const removeOp = client.removeRangeLocal(start, end);

        assert.equal(segmentInfo.segment.removedSeq, UnassignedSequenceNumber);
        assert.equal(segmentInfo.segment.segmentGroups.size, 1);

        const remoteMessage = client.makeOpMessage(removeOp, 17);
        remoteMessage.clientId = "remoteClient";

        client.applyMsg(remoteMessage);

        assert.equal(segmentInfo.segment.removedSeq, remoteMessage.sequenceNumber);
        assert.equal(segmentInfo.segment.segmentGroups.size, 1);

        client.applyMsg(client.makeOpMessage(removeOp, 17));

        assert.equal(segmentInfo.segment.removedSeq, remoteMessage.sequenceNumber);
        assert(segmentInfo.segment.segmentGroups.empty);
        assert.equal(client.getLength(), initalLength - (end - start));
        assert.equal(client.getText(), intialText.substring(0, start) + intialText.substring(end));
    });
});
