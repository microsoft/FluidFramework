/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { TrackingGroup } from "../mergeTreeTracking";
import { TestClient } from "./testClient";

describe("MergeTree.tracking", () => {
    let testClient: TestClient;

    beforeEach(() => {
        testClient = new TestClient();
        testClient.startOrUpdateCollaboration("me");
    });

    it("Inserted segment should have empty tracking groups",
        () => {
            testClient.insertTextLocal(0, "abc");

            assert.equal(testClient.getLength(), 3);

            const segmentInfo = testClient.getContainingSegment(0);

            assert(segmentInfo?.segment?.trackingCollection.empty);
        });

    it("Insert single segment with single tracking group",
        () => {
            const trackingGroup = new TrackingGroup();

            testClient.mergeTree.mergeTreeDeltaCallback =
                (opArgs, deltaArgs) => {
                    deltaArgs.deltaSegments.forEach((sg) => sg.segment.trackingCollection.link(trackingGroup));
                };

            testClient.insertTextLocal(0, "abc");

            assert.equal(trackingGroup.size, 1);

            const segmentInfo = testClient.getContainingSegment(0);

            assert.equal(segmentInfo?.segment?.trackingCollection.trackingGroups.size, 1);
        });

    it("Splitting segment should split tracking group",
        () => {
            const trackingGroup = new TrackingGroup();

            testClient.mergeTree.mergeTreeDeltaCallback =
                (opArgs, deltaArgs) => {
                    deltaArgs.deltaSegments.forEach((sg) => sg.segment.trackingCollection.link(trackingGroup));
                };

            const ops = [testClient.insertTextLocal(0, "abc")];

            testClient.mergeTree.mergeTreeDeltaCallback = undefined;
            assert.equal(trackingGroup.size, 1);

            ops.push(testClient.insertTextLocal(1, "z"));
            assert.equal(testClient.getLength(), 4);

            assert.equal(trackingGroup.size, 2);
            const segmentInfo = testClient.getContainingSegment(0);
            assert.equal(segmentInfo?.segment?.trackingCollection.trackingGroups.size, 1);
        });

    it("Zamboni should merge matching tracking groups",
        () => {
            const trackingGroup = new TrackingGroup();

            testClient.mergeTree.mergeTreeDeltaCallback =
                (opArgs, deltaArgs) => {
                    deltaArgs.deltaSegments.forEach((sg) => sg.segment.trackingCollection.link(trackingGroup));
                };

            const ops = [testClient.insertTextLocal(0, "abc")];

            assert.equal(trackingGroup.size, 1);

            ops.push(testClient.insertTextLocal(1, "z"));
            assert.equal(testClient.getLength(), 4);

            assert.equal(trackingGroup.size, 3);
            let segmentInfo = testClient.getContainingSegment(0);
            assert.equal(segmentInfo?.segment?.trackingCollection.trackingGroups.size, 1);

            let seq = 1;
            ops.forEach((op) => testClient.applyMsg(testClient.makeOpMessage(op, ++seq)));

            assert.equal(trackingGroup.size, 3);
            segmentInfo = testClient.getContainingSegment(0);
            assert.equal(segmentInfo?.segment?.trackingCollection.trackingGroups.size, 1);

            testClient.updateMinSeq(seq);

            assert.equal(trackingGroup.size, 1);
            segmentInfo = testClient.getContainingSegment(0);
            assert.equal(segmentInfo?.segment?.trackingCollection.trackingGroups.size, 1);
        });
});
