/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { UniversalSequenceNumber } from "../constants";
import { Marker, reservedMarkerIdKey, SegmentGroup } from "../mergeTreeNodes";
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
    it("Should rollback annotate marker", async () => {
        client.insertMarkerLocal(
            0,
            ReferenceType.Simple,
            {
                [reservedMarkerIdKey]: "markerId",
            },
        );
        const marker = client.getMarkerFromId("markerId") as Marker;
        client.annotateMarker(marker, { foo: "bar" }, undefined);
        client.rollback?.({ type: MergeTreeDeltaType.ANNOTATE }, client.peekPendingSegmentGroups());

        const properties = marker.getProperties();
        assert.equal(properties?.foo, undefined);
    });
    it("Should rollback annotate marker overwriting property", async () => {
        client.insertMarkerLocal(
            0,
            ReferenceType.Simple,
            {
                [reservedMarkerIdKey]: "markerId",
                foo: "bar",
            },
        );
        const marker = client.getMarkerFromId("markerId") as Marker;
        client.annotateMarker(marker, { foo: "baz" }, undefined);
        client.rollback?.({ type: MergeTreeDeltaType.ANNOTATE }, client.peekPendingSegmentGroups());

        const properties = marker.getProperties();
        assert.equal(properties?.foo, "bar");
    });
    it("Should rollback annotate marker removing property", async () => {
        client.insertMarkerLocal(
            0,
            ReferenceType.Simple,
            {
                [reservedMarkerIdKey]: "markerId",
                foo: "bar",
            },
        );
        const marker = client.getMarkerFromId("markerId") as Marker;
        client.annotateMarker(marker, { foo: null }, undefined);
        client.rollback?.({ type: MergeTreeDeltaType.ANNOTATE }, client.peekPendingSegmentGroups());

        const properties = marker.getProperties();
        assert.equal(properties?.foo, "bar");
    });
    it("Should rollback annotate marker rewrite", async () => {
        client.insertMarkerLocal(
            0,
            ReferenceType.Simple,
            {
                [reservedMarkerIdKey]: "markerId",
                foo: "bar",
            },
        );
        const marker = client.getMarkerFromId("markerId") as Marker;
        client.annotateMarker(marker, { abc: "def" }, { name: "rewrite" });
        client.rollback?.({ type: MergeTreeDeltaType.ANNOTATE, combiningOp: { name: "rewrite" } },
            client.peekPendingSegmentGroups());

        const properties = marker.getProperties();
        assert.equal(properties?.foo, "bar");
        assert.equal(properties?.abc, undefined);
    });
    it("Should rollback annotate rewrite with explicit null", async () => {
        client.insertMarkerLocal(
            0,
            ReferenceType.Simple,
            {
                [reservedMarkerIdKey]: "markerId",
                foo: "bar",
            },
        );
        const marker = client.getMarkerFromId("markerId") as Marker;
        client.annotateMarker(marker, { abc: "def", foo: null }, { name: "rewrite" });
        client.rollback?.({ type: MergeTreeDeltaType.ANNOTATE, combiningOp: { name: "rewrite" } },
            client.peekPendingSegmentGroups());

        const properties = marker.getProperties();
        assert.equal(properties?.foo, "bar");
        assert.equal(properties?.abc, undefined);
    });
    it("Should rollback annotate causes split string", async () => {
        client.insertTextLocal(0, "abcdefg");
        client.annotateRangeLocal(1, 3, { foo: "bar" }, undefined);
        client.rollback?.({ type: MergeTreeDeltaType.ANNOTATE }, client.peekPendingSegmentGroups());

        for (let i = 0; i < 4; i++) {
            const props = client.getPropertiesAtPosition(i);
            assert(props === undefined || props.foo === undefined);
        }
    });
    it("Should rollback annotate over split string", async () => {
        client.insertTextLocal(0, "abfg");
        client.insertTextLocal(1, "cde");
        client.annotateRangeLocal(1, 6, { foo: "bar" }, undefined);
        client.rollback?.({ type: MergeTreeDeltaType.ANNOTATE }, client.peekPendingSegmentGroups());

        for (let i = 0; i < 7; i++) {
            const props = client.getPropertiesAtPosition(i);
            assert(props === undefined || props.foo === undefined);
        }
    });
    it("Should rollback annotate with same prop", async () => {
        client.insertTextLocal(0, "abcde");
        client.annotateRangeLocal(2, 3, { foo: "bar" }, undefined);
        client.annotateRangeLocal(1, 4, { foo: "bar" }, undefined);
        client.rollback?.({ type: MergeTreeDeltaType.ANNOTATE }, client.peekPendingSegmentGroups());

        for (let i = 0; i < 5; i++) {
            const props = client.getPropertiesAtPosition(i);
            if (i === 2) {
                assert.equal(props?.foo, "bar");
            } else {
                assert(props === undefined || props.foo === undefined);
            }
        }
    });
    it("Should zamboni rolled back annotated segment", async () => {
        client.applyMsg(
            client.makeOpMessage(
                client.insertTextLocal(0, "abcde", { color: "red" }),
                client.getCurrentSeq() + 1,
                client.getCurrentSeq(),
                undefined,
                client.getCurrentSeq()));
        client.annotateRangeLocal(2, 3, { foo: "bar" }, undefined);
        const segmentGroup = client.peekPendingSegmentGroups() as SegmentGroup;
        const segment = segmentGroup.segments[0];
        client.rollback?.({ type: MergeTreeDeltaType.ANNOTATE }, segmentGroup);

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
