/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { UniversalSequenceNumber } from "../constants";
import { reservedMarkerIdKey, SegmentGroup } from "../mergeTreeNodes";
import { MergeTreeDeltaType, ReferenceType } from "../ops";
import { TextSegment } from "../textSegment";
import { TestClient } from "./testClient";

describe("client.rollback", () => {
    const localUserLongId = "localUser";
    let client: TestClient;

    beforeEach(() => {
        client = new TestClient();
        client.mergeTree.insertSegments(
            0,
            [TextSegment.make("")],
            UniversalSequenceNumber,
            client.getClientId(),
            UniversalSequenceNumber,
            undefined);
        client.startOrUpdateCollaboration(localUserLongId);
    });

    it("Should rollback insert on empty string", async () => {
        client.insertTextLocal(0, "abcd");
        client.rollback?.({ type: MergeTreeDeltaType.INSERT }, client.peekPendingSegmentGroups());

        assert.equal(client.getText(), "");
    });
    it("Should rollback insert marker", async () => {
        client.insertTextLocal(0, "abc");
        client.insertMarkerLocal(
            1,
            ReferenceType.Simple,
            {
                [reservedMarkerIdKey]: "markerId",
            },
        );
        client.rollback?.({ type: MergeTreeDeltaType.INSERT }, client.peekPendingSegmentGroups());

        assert.equal(client.getText(), "abc");
        const marker = client.getMarkerFromId("markerId");
        assert.notEqual(marker?.removedSeq, undefined);
    });
    it("Should rollback multiple inserts with split segments", async () => {
        client.insertTextLocal(0, "aefg");
        client.insertTextLocal(1, "bd");
        client.insertTextLocal(2, "c");
        client.rollback?.({ type: MergeTreeDeltaType.INSERT }, client.peekPendingSegmentGroups());
        client.rollback?.({ type: MergeTreeDeltaType.INSERT }, client.peekPendingSegmentGroups());

        assert.equal(client.getText(), "aefg");
    });
    it("Should zamboni rolled back insert", async () => {
        client.insertTextLocal(0, "aefg");
        client.insertTextLocal(1, "bcd");
        const segmentGroup = client.peekPendingSegmentGroups() as SegmentGroup;
        const segment = segmentGroup.segments[0];
        client.rollback?.({ type: MergeTreeDeltaType.INSERT }, segmentGroup);

        // do some work and move the client's min seq forward, so zamboni runs
        for (const c of "hello world") {
            client.applyMsg(
                client.makeOpMessage(
                    client.insertTextLocal(client.getLength(), c),
                    client.getCurrentSeq() + 1,
                    client.getCurrentSeq(),
                    undefined,
                    client.getCurrentSeq()));
        }

        assert.equal(segment.parent, undefined);
    });
});
