import { ISequencedDocumentMessage } from "@prague/container-definitions";
import * as assert from "assert";
import { Client, SegmentGroup, UnassignedSequenceNumber } from "..";
import { insertTextLocal, specToSegment } from "./testUtils";

describe("client.applyMsg", () => {
    const localUserLongId = "localUser";
    let client: Client;

    beforeEach(() => {
        client = new Client("hello world", specToSegment);

        client.startCollaboration(localUserLongId);
    });

    it("Interleaved inserts, annotates, and deletes", () => {
        const changes = new Map<number, {msg: ISequencedDocumentMessage, segmentGroup: SegmentGroup}>();
        assert.equal(client.mergeTree.pendingSegments.count(), 0);
        for (let i = 0; i < 100; i++) {
            const len = client.getLength();
            const pos1 = Math.floor(len / 2);
            let msg: ISequencedDocumentMessage;
            const imod6 = i % 6;
            switch (imod6) {

                case 0:
                case 5: {
                    const pos2 = Math.max(Math.floor((len - pos1) / 4) - imod6 + pos1, pos1 + 1);
                    msg = client.makeRemoveMsg(
                        pos1,
                        pos2,
                        i + 1,
                        client.mergeTree.collabWindow.currentSeq,
                        undefined);
                    client.removeSegmentLocal(pos1, pos2);
                    changes.set(i, {msg, segmentGroup: client.mergeTree.pendingSegments.last()});
                    break;
                }

                case 1:
                case 4: {
                    const str = `${i}`.repeat(imod6 + 5);
                    msg = client.makeInsertMsg(
                        str,
                        pos1,
                        i + 1,
                        client.mergeTree.collabWindow.currentSeq,
                        undefined);
                    insertTextLocal(client, str, pos1);
                    changes.set(i, {msg, segmentGroup: client.mergeTree.pendingSegments.last()});
                    break;
                }

                case 2:
                case 3: {
                    const pos2 = Math.max(Math.floor((len - pos1) / 3) - imod6 + pos1, pos1 + 1);
                    msg = client.makeAnnotateMsg(
                        {
                            foo: `${i}`,
                        },
                        pos1,
                        pos2,
                        i + 1,
                        client.mergeTree.collabWindow.currentSeq,
                        undefined);
                    client.annotateSegmentLocal(
                        {
                            foo: `${i}`,
                        },
                        pos1,
                        pos2,
                        undefined);
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

        insertTextLocal(client, "abc", 0);

        const segmentInfo =
            client.mergeTree.getContainingSegment(0, client.getCurrentSeq(), client.getClientId());

        assert.equal(segmentInfo.segment.seq, UnassignedSequenceNumber);

        client.applyMsg(
            client.makeInsertMsg(
                "abc",
                0,
                17,
                0,
                undefined));

        assert.equal(segmentInfo.segment.seq, 17);
    });

    it("removeSegmentLocal", () => {
        const segmentInfo =
            client.mergeTree.getContainingSegment(0, client.getCurrentSeq(), client.getClientId());

        client.removeSegmentLocal(0, 1);

        assert.equal(segmentInfo.segment.removedSeq, UnassignedSequenceNumber);

        client.applyMsg(
            client.makeRemoveMsg(
                0,
                1,
                17,
                0,
                undefined));

        assert.equal(segmentInfo.segment.removedSeq, 17);
    });

    it("annotateSegmentLocal", () => {
        const props = {
            foo: "bar",
        };
        client.annotateSegmentLocal(
            props,
            0,
            1,
            undefined);

        client.applyMsg(
            client.makeAnnotateMsg(
                props,
                0,
                1,
                17,
                0,
                undefined));

        assert.equal(client.mergeTree.pendingSegments.count(), 0);
    });

    it("annotateSegmentLocal then removeSegmentLocal", () => {
        const segmentInfo =
            client.mergeTree.getContainingSegment(0, client.getCurrentSeq(), client.getClientId());

        const start = 0;
        const end = client.getText().length;

        const props = {
                foo: "bar",
        };

        client.annotateSegmentLocal(
            props,
            start,
            end,
            undefined);

        assert.equal(client.mergeTree.pendingSegments.count(), 0);

        client.removeSegmentLocal(start, end);

        assert.equal(segmentInfo.segment.removedSeq, UnassignedSequenceNumber);
        assert.equal(client.mergeTree.pendingSegments.count(), 1);

        client.applyMsg(
            client.makeAnnotateMsg(
                props,
                start,
                end,
                17,
                0,
                undefined));

        assert.equal(segmentInfo.segment.removedSeq, UnassignedSequenceNumber);
        assert.equal(client.mergeTree.pendingSegments.count(), 1);

        client.applyMsg(
            client.makeRemoveMsg(
                start,
                end,
                18,
                0,
                undefined));

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
            client.annotateSegmentLocal(
                props,
                0,
                annotateEnd,
                undefined);

            messages.push(
                client.makeAnnotateMsg(
                    props,
                    0,
                    annotateEnd,
                    ++sequenceNumber,
                    0,
                    undefined));

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

        client.removeSegmentLocal(start, end);

        assert.equal(segmentInfo.segment.removedSeq, UnassignedSequenceNumber);
        assert.equal(segmentInfo.segment.segmentGroups.size, 1);

        const remoteMessage = client.makeRemoveMsg(
            start,
            end,
            17,
            0,
            undefined);
        remoteMessage.clientId = "remoteClient";

        client.applyMsg(remoteMessage);

        assert.equal(segmentInfo.segment.removedSeq, remoteMessage.sequenceNumber);
        assert.equal(segmentInfo.segment.segmentGroups.size, 1);

        client.applyMsg(
            client.makeRemoveMsg(
                start,
                end,
                18,
                0,
                undefined));

        assert.equal(segmentInfo.segment.removedSeq, remoteMessage.sequenceNumber);
        assert(segmentInfo.segment.segmentGroups.empty);
        assert.equal(client.getLength(), initalLength - (end - start));
        assert.equal(client.getText(), intialText.substring(0, start) + intialText.substring(end));
    });
});
