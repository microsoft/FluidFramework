import * as assert from "assert";
import * as MergeTree from "../mergeTree";
import { TrackingGroup } from "../mergeTreeTracking";
import { TextSegment } from "../textSegment";

describe("MergeTree.tracking", () => {
    const localClientId = 43;
    let mergeTree: MergeTree.MergeTree;
    let referenceSequenceNumber: number;

    beforeEach(() => {
        referenceSequenceNumber = 0;
        mergeTree = new MergeTree.MergeTree();
        mergeTree.startCollaboration(localClientId, referenceSequenceNumber, 0);
    });

    it("Inserted segment should have empty tracking groups",
        () => {
            mergeTree.insertSegments(
                0,
                [TextSegment.Make("abc")],
                referenceSequenceNumber,
                localClientId,
                MergeTree.UnassignedSequenceNumber,
                undefined);

            assert.equal(mergeTree.getLength(referenceSequenceNumber, localClientId), 3);

            const segmentInfo =
                mergeTree.getContainingSegment(0, referenceSequenceNumber, localClientId);

            assert(segmentInfo.segment.trackingCollection.empty);
        });

    it("Insert single segment with single tracking group",
        () => {
            const trackingGroup = new TrackingGroup();

            mergeTree.mergeTreeDeltaCallback =
                (opArgs, deltaArgs) => {
                    deltaArgs.deltaSegments.forEach((sg) => sg.segment.trackingCollection.link(trackingGroup));
                };

            mergeTree.insertSegments(
                0,
                [TextSegment.Make("abc")],
                referenceSequenceNumber,
                localClientId,
                MergeTree.UnassignedSequenceNumber,
                {op: undefined});

            assert.equal(mergeTree.getLength(referenceSequenceNumber, localClientId), 3);

            assert.equal(trackingGroup.size, 1);

            const segmentInfo =
                mergeTree.getContainingSegment(0, referenceSequenceNumber, localClientId);

            assert.equal(segmentInfo.segment.trackingCollection.trackingGroups.size, 1);
        });

    it("Spliting segment should split tracking group",
        () => {
            const trackingGroup = new TrackingGroup();

            mergeTree.mergeTreeDeltaCallback =
                (opArgs, deltaArgs) => {
                    deltaArgs.deltaSegments.forEach((sg) => sg.segment.trackingCollection.link(trackingGroup));
                };

            mergeTree.insertSegments(
                0,
                [TextSegment.Make("abc")],
                referenceSequenceNumber,
                localClientId,
                MergeTree.UnassignedSequenceNumber,
                {op: undefined});

            mergeTree.mergeTreeDeltaCallback = undefined;
            assert.equal(trackingGroup.size, 1);

            mergeTree.insertSegments(
                1,
                [TextSegment.Make("z")],
                referenceSequenceNumber,
                localClientId,
                MergeTree.UnassignedSequenceNumber,
                {op: undefined});

            assert.equal(mergeTree.getLength(referenceSequenceNumber, localClientId), 4);

            assert.equal(trackingGroup.size, 2);

            const segmentInfo =
                mergeTree.getContainingSegment(0, referenceSequenceNumber, localClientId);

            assert.equal(segmentInfo.segment.trackingCollection.trackingGroups.size, 1);
        });
});
