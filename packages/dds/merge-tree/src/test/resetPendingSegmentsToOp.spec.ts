/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
/* eslint-disable @typescript-eslint/no-non-null-assertion */

import { strict as assert } from "assert";
import { IMergeTreeOp } from "../ops";
import { TestClient } from "./testClient";

describe("resetPendingSegmentsToOp", () => {
    let client: TestClient;
    let opList: IMergeTreeOp[];
    let opCount: number = 0;
    const insertCount = 5;
    const expectedSegmentCount = insertCount * 2 - 1;

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
        client = new TestClient();
        client.startOrUpdateCollaboration("local user");
        assert(client.mergeTree.pendingSegments?.empty());
        opList = [];

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
