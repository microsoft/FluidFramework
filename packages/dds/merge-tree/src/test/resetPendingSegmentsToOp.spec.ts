/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
/* eslint-disable @typescript-eslint/no-non-null-assertion */

import { strict as assert } from "assert";
import { Marker, reservedMarkerIdKey } from "../mergeTree";
import { IMergeTreeOp, ReferenceType } from "../ops";
import { clone } from "../properties";
import { TextSegment } from "../textSegment";
import { TestClient } from "./testClient";

describe("resetPendingSegmentsToOp", () => {
    let client: TestClient;

    beforeEach(() => {
        client = new TestClient();
        client.startOrUpdateCollaboration("local user");
        assert(client.mergeTree.pendingSegments?.empty());
    });

    describe("with a number of nested inserts", () => {
        const insertCount = 5;
        const expectedSegmentCount = insertCount * 2 - 1;
        let opList: IMergeTreeOp[];
        let opCount: number = 0;

        function applyOpList(cli: TestClient) {
            while (opList.length > 0) {
                const op = opList.shift();
                if (op) {
                    const seqOp = cli.makeOpMessage(op, ++opCount);
                    cli.applyMsg(seqOp);
                }
            }
        }

        beforeEach(() => {
            opList = [];
            opCount = 0;

            for (let i = 0; i < insertCount; i++) {
                const op = client.insertTextLocal(i, "hello")!;
                opList.push(op);
                assert.equal(client.mergeTree.pendingSegments?.count(), i + 1);
            }
        });

        it("acked insertSegment", async () => {
            applyOpList(client);
            assert(client.mergeTree.pendingSegments?.empty());
        });

        it("nacked insertSegment", async () => {
            const oldops = opList;
            opList = oldops.map((op) => client.regeneratePendingOp(op, client.mergeTree.pendingSegments!.first()!));
            // we expect a nack op per segment since our original ops split segments
            // we should expect mores nack ops then original ops.
            // only the first op didn't split a segment, all the others did
            assert.equal(client.mergeTree.pendingSegments?.count(), expectedSegmentCount);
            applyOpList(client);
            assert(client.mergeTree.pendingSegments?.empty());
        });

        it("acked removeRange", async () => {
            applyOpList(client);
            assert(client.mergeTree.pendingSegments?.empty());

            opList.push(client.removeRangeLocal(0, client.getLength())!);
            applyOpList(client);
            assert(client.mergeTree.pendingSegments?.empty());
        });

        it("nacked removeRange", async () => {
            applyOpList(client);
            assert(client.mergeTree.pendingSegments?.empty());

            opList.push(client.removeRangeLocal(0, client.getLength())!);
            opList.push(client.regeneratePendingOp(opList.shift()!, client.mergeTree.pendingSegments!.first()!));
            // we expect a nack op per segment since our original ops split segments
            // we should expect mores nack ops then original ops.
            // only the first op didn't split a segment, all the others did
            assert.equal(client.mergeTree.pendingSegments?.count(), expectedSegmentCount);
            applyOpList(client);
            assert(client.mergeTree.pendingSegments?.empty());
        });

        it("nacked insertSegment and removeRange", async () => {
            opList.push(client.removeRangeLocal(0, client.getLength())!);
            const oldops = opList;
            opList = oldops.map((op) => client.regeneratePendingOp(op, client.mergeTree.pendingSegments!.first()!));

            assert.equal(client.mergeTree.pendingSegments?.count(), expectedSegmentCount * 2);

            applyOpList(client);

            assert(client.mergeTree.pendingSegments?.empty());
        });

        it("acked annotateRange", async () => {
            applyOpList(client);
            assert(client.mergeTree.pendingSegments?.empty());

            opList.push(client.annotateRangeLocal(0, client.getLength(), { foo: "bar" }, undefined)!);
            applyOpList(client);
            assert(client.mergeTree.pendingSegments?.empty());
        });

        it("nacked annotateRange", async () => {
            applyOpList(client);
            assert(client.mergeTree.pendingSegments?.empty());

            opList.push(client.annotateRangeLocal(0, client.getLength(), { foo: "bar" }, undefined)!);
            opList.push(client.regeneratePendingOp(opList.shift()!, client.mergeTree.pendingSegments!.first()!));
            // we expect a nack op per segment since our original ops split segments
            // we should expect mores nack ops then original ops.
            // only the first op didn't split a segment, all the others did
            assert.equal(client.mergeTree.pendingSegments?.count(), expectedSegmentCount);
            applyOpList(client);
            assert(client.mergeTree.pendingSegments?.empty());
        });

        it("nacked insertSegment and annotateRange", async () => {
            opList.push(client.annotateRangeLocal(0, client.getLength(), { foo: "bar" }, undefined)!);
            const oldops = opList;
            opList = oldops.map((op) => client.regeneratePendingOp(op, client.mergeTree.pendingSegments!.first()!));
            // we expect a nack op per segment since our original ops split segments
            // we should expect mores nack ops then original ops.
            // only the first op didn't split a segment, all the others did
            assert.equal(client.mergeTree.pendingSegments?.count(), expectedSegmentCount * 2);
            applyOpList(client);
            assert(client.mergeTree.pendingSegments?.empty());
        });
    });

    describe("uses original properties on insert", () => {
        // Regression tests for an issue where regenerated insert ops would use the properties of a segment
        // at the time of regeneration rather than its properties at insertion time.
        it("for markers", () => {
            const insertOp = client.insertMarkerLocal(
                0,
                ReferenceType.Simple,
                { [reservedMarkerIdKey]: "id", prop1: "foo" },
            );
            assert(insertOp);
            const { segment } = client.getContainingSegment(0);
            assert(segment !== undefined && Marker.is(segment));
            client.annotateMarker(segment, { prop2: "bar" });

            const otherClient = new TestClient();
            otherClient.startOrUpdateCollaboration("other user");
            const regeneratedInsert = client.regeneratePendingOp(insertOp, client.mergeTree.pendingSegments!.first()!);
            otherClient.applyMsg(client.makeOpMessage(regeneratedInsert, 1), false);

            const { segment: otherSegment } = otherClient.getContainingSegment(0);
            assert(otherSegment !== undefined && Marker.is(otherSegment));
            // `clone` here is because properties use a Object.create(null); to compare strict equal the prototype chain
            // should therefore not include Object.
            assert.deepStrictEqual(otherSegment.properties, clone({ [reservedMarkerIdKey]: "id", prop1: "foo" }));
        });

        it("for text segments", () => {
            const insertOp = client.insertTextLocal(0, "abc", { prop1: "foo" });
            assert(insertOp);
            client.annotateRangeLocal(0, 3, { prop2: "bar" }, undefined);

            const otherClient = new TestClient();
            otherClient.startOrUpdateCollaboration("other user");
            const regeneratedInsert = client.regeneratePendingOp(insertOp, client.mergeTree.pendingSegments!.first()!);
            otherClient.applyMsg(client.makeOpMessage(regeneratedInsert, 1), false);

            const { segment: otherSegment } = otherClient.getContainingSegment(0);
            assert(otherSegment !== undefined && TextSegment.is(otherSegment));
            assert.deepStrictEqual(otherSegment.properties, clone({ prop1: "foo" }));
        });
    });
});
