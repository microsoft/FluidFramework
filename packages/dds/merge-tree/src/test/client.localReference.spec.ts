/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
/* eslint-disable @typescript-eslint/no-non-null-assertion */

import { strict as assert } from "assert";
import { ISequencedDocumentMessage } from "@fluidframework/protocol-definitions";
import { Marker, toRemovalInfo } from "../mergeTree";
import { MergeTreeDeltaType, ReferenceType } from "../ops";
import { TextSegment } from "../textSegment";
import { createClientsAtInitialState } from "./testClientLogger";
import { TestClient } from "./";

describe("MergeTree.Client", () => {
    it("Remove segment of non-sliding local reference", () => {
        const client1 = new TestClient();
        const client2 = new TestClient();

        client1.startOrUpdateCollaboration("1");
        client2.startOrUpdateCollaboration("2");
        let seq = 0;
        for (let i = 0; i < 5; i++) {
            const insert =
                client1.makeOpMessage(
                    client1.insertTextLocal(client1.getLength(), i.toString()),
                    ++seq);
            insert.minimumSequenceNumber = seq - 1;
            client1.applyMsg(insert);
            client2.applyMsg(insert);
        }

        const segInfo = client1.getContainingSegment(2);
        const c1LocalRef = client1.createLocalReferencePosition(
            segInfo.segment!, segInfo.offset!, ReferenceType.Simple, undefined);

        assert.equal(client1.localReferencePositionToPosition(c1LocalRef), 2, "create position");

        const remove =
            client2.makeOpMessage(
                client2.removeRangeLocal(2, 3),
                ++seq);
        remove.minimumSequenceNumber = seq - 1;
        client1.applyMsg(remove);
        client2.applyMsg(remove);

        // this only works because zamboni hasn't run yet
        assert.equal(client1.localReferencePositionToPosition(c1LocalRef), -1, "after remove");

        // this will force Zamboni to run
        for (let i = 0; i < 5; i++) {
            const insert =
                client1.makeOpMessage(
                    client1.insertTextLocal(client1.getLength(), i.toString()),
                    ++seq);
            insert.minimumSequenceNumber = seq - 1;
            client1.applyMsg(insert);
            client2.applyMsg(insert);
        }
        assert.equal(c1LocalRef.getSegment(), undefined);
        assert.equal(client1.localReferencePositionToPosition(c1LocalRef), -1, "after zamboni");
    });

    it("Remove segment of sliding local reference", () => {
        const client1 = new TestClient();
        const client2 = new TestClient();

        client1.startOrUpdateCollaboration("1");
        client2.startOrUpdateCollaboration("2");
        let seq = 0;
        for (let i = 0; i < 5; i++) {
            const insert =
                client1.makeOpMessage(
                    client1.insertTextLocal(client1.getLength(), i.toString()),
                    ++seq);
            insert.minimumSequenceNumber = seq - 1;
            client1.applyMsg(insert);
            client2.applyMsg(insert);
        }

        const segInfo = client1.getContainingSegment(2);
        const c1LocalRef = client1.createLocalReferencePosition(
            segInfo.segment!, segInfo.offset!, ReferenceType.SlideOnRemove, undefined);

        assert.equal(client1.localReferencePositionToPosition(c1LocalRef), 2);

        const remove =
            client2.makeOpMessage(
                client2.removeRangeLocal(2, 3),
                ++seq);
        remove.minimumSequenceNumber = seq - 1;
        client1.applyMsg(remove);
        client2.applyMsg(remove);

        assert.equal(client1.localReferencePositionToPosition(c1LocalRef), 2);

        for (let i = 0; i < 5; i++) {
            const insert =
                client1.makeOpMessage(
                    client1.insertTextLocal(client1.getLength(), i.toString()),
                    ++seq);
            insert.minimumSequenceNumber = seq - 1;
            client1.applyMsg(insert);
            client2.applyMsg(insert);
        }

        assert.equal(client1.localReferencePositionToPosition(c1LocalRef), 2);
    });

    it("Remove segments to end with sliding local reference", () => {
        const client1 = new TestClient();
        const client2 = new TestClient();

        client1.startOrUpdateCollaboration("1");
        client2.startOrUpdateCollaboration("2");
        let seq = 0;
        for (let i = 0; i < 5; i++) {
            const insert =
                client1.makeOpMessage(
                    client1.insertTextLocal(client1.getLength(), i.toString()),
                    ++seq);
            insert.minimumSequenceNumber = seq - 1;
            client1.applyMsg(insert);
            client2.applyMsg(insert);
        }

        const segInfo = client1.getContainingSegment(2);
        const c1LocalRef = client1.createLocalReferencePosition(
            segInfo.segment!, segInfo.offset!, ReferenceType.SlideOnRemove, undefined);

        assert.equal(client1.localReferencePositionToPosition(c1LocalRef), 2);

        const remove =
            client2.makeOpMessage(
                client2.removeRangeLocal(2, client2.getLength()),
                ++seq);
        remove.minimumSequenceNumber = seq - 1;
        client1.applyMsg(remove);
        client2.applyMsg(remove);

        assert.equal(client1.localReferencePositionToPosition(c1LocalRef), client2.getLength() - 1);
    });

    it("Remove segments from end with sliding local reference", () => {
        const client1 = new TestClient();

        client1.startOrUpdateCollaboration("1");
        let seq = 0;
        const insert = client1.makeOpMessage(
            client1.insertTextLocal(0, "ABCD"),
            ++seq);
        insert.minimumSequenceNumber = seq - 1;
        client1.applyMsg(insert);

        const segInfo = client1.getContainingSegment(3);
        const c1LocalRef = client1.createLocalReferencePosition(
            segInfo.segment!, segInfo.offset!, ReferenceType.SlideOnRemove, undefined);

        assert.equal(client1.localReferencePositionToPosition(c1LocalRef), 3);

        const remove1 = client1.makeOpMessage(
            client1.removeRangeLocal(3, 4), ++seq);
        remove1.minimumSequenceNumber = seq - 1;
        assert.equal(client1.localReferencePositionToPosition(c1LocalRef), 3);

        const remove2 = client1.makeOpMessage(
            client1.removeRangeLocal(1, 3), ++seq);
        remove2.minimumSequenceNumber = seq - 1;
        assert.equal(client1.localReferencePositionToPosition(c1LocalRef), 1);

        client1.applyMsg(remove1);
        client1.applyMsg(remove2);

        assert.equal(client1.localReferencePositionToPosition(c1LocalRef), 0);
    });

    it("changeReferenceType throws", () => {
        const client1 = new TestClient();
        client1.startOrUpdateCollaboration("1");
        let seq = 0;
        const insert = client1.makeOpMessage(
            client1.insertTextLocal(0, "ABCD"),
            ++seq);
        insert.minimumSequenceNumber = seq - 1;
        client1.applyMsg(insert);

        const segInfo = client1.getContainingSegment(2);
        const c1LocalRef = client1.createLocalReferencePosition(
            segInfo.segment!, segInfo.offset!, ReferenceType.Transient, undefined);

        assert.throws(() => { client1.changeReferenceType(c1LocalRef, ReferenceType.SlideOnRemove); },
            "should throw changing Transient reference");
        const marker = new Marker(ReferenceType.StayOnRemove);
        assert.throws(() => { client1.changeReferenceType(marker, ReferenceType.SlideOnRemove); },
            "should throw when called on Marker");

        const c2LocalRef = client1.createLocalReferencePosition(
            segInfo.segment!, segInfo.offset!, ReferenceType.StayOnRemove, undefined);
        assert.throws(() => { client1.changeReferenceType(c2LocalRef, ReferenceType.Simple); },
            "should throw not changing to SlideOnRemove");
    });

    it("changeReferenceType slides reference", () => {
        const client1 = new TestClient();

        client1.startOrUpdateCollaboration("1");
        let seq = 0;
        const insert = client1.makeOpMessage(
            client1.insertTextLocal(0, "ABCD"),
            ++seq);
        insert.minimumSequenceNumber = seq - 1;
        client1.applyMsg(insert);

        const segInfo = client1.getContainingSegment(2);
        const c1LocalRef = client1.createLocalReferencePosition(
            segInfo.segment!, segInfo.offset!, ReferenceType.StayOnRemove, undefined);

        assert.equal(client1.localReferencePositionToPosition(c1LocalRef), 2);

        const remove1 = client1.makeOpMessage(
            client1.removeRangeLocal(1, 4), ++seq);
        remove1.minimumSequenceNumber = seq - 1;
        assert.equal(client1.localReferencePositionToPosition(c1LocalRef), 1);

        client1.applyMsg(remove1);
        assert.equal(client1.localReferencePositionToPosition(c1LocalRef), 1);

        client1.changeReferenceType(c1LocalRef, ReferenceType.SlideOnRemove);

        assert.equal(client1.localReferencePositionToPosition(c1LocalRef), 0);
    });

    it("getSlideOnRemoveReferencePosition", () => {
        const client1 = new TestClient();
        const client2 = new TestClient();
        client1.startOrUpdateCollaboration("1");
        client2.startOrUpdateCollaboration("2");

        let seq = 0;
        const insert1 = client1.makeOpMessage(
            client1.insertTextLocal(0, "XYZ"),
            ++seq);
        client1.applyMsg(insert1);

        const insert2 = client1.makeOpMessage(
            client1.insertTextLocal(0, "ABC"),
            ++seq);
        client1.applyMsg(insert2);

        // Position depends on op
        const createReference1 = client2.makeOpMessage(
            { type: MergeTreeDeltaType.INSERT }, ++seq, insert1.sequenceNumber);
        let segoff = client1.getSlideOnRemoveReferencePosition(1, createReference1);
        assert(segoff.segment);
        assert.equal(client1.getPosition(segoff.segment), 3);
        assert.equal(segoff.offset, 1);

        const createReference2 = client2.makeOpMessage(
            { type: MergeTreeDeltaType.INSERT }, ++seq, insert2.sequenceNumber);
        segoff = client1.getSlideOnRemoveReferencePosition(2, createReference2);
        assert(segoff.segment);
        assert.equal(client1.getPosition(segoff.segment), 0);
        assert.equal(segoff.offset, 2);

        // Throws
        assert.throws(() => { client1.getSlideOnRemoveReferencePosition(-1, createReference2); },
            "should throw on negative position");
        assert.throws(() => { client1.getSlideOnRemoveReferencePosition(7, createReference2); },
            "should throw on position past end of string");

        // On a removed, unacked segment
        let remove = client1.makeOpMessage(
            client1.removeRangeLocal(2, 5),
            ++seq);
        segoff = client1.getSlideOnRemoveReferencePosition(3, createReference2);
        assert(segoff.segment);
        assert.notEqual(toRemovalInfo(segoff.segment), undefined);
        assert.equal(client1.getPosition(segoff.segment), 2);
        assert.equal(segoff.offset, 0);

        // Slid from a removed, acked segment
        client1.applyMsg(remove);
        segoff = client1.getSlideOnRemoveReferencePosition(3, createReference2);
        assert(segoff.segment);
        assert.equal(toRemovalInfo(segoff.segment), undefined);
        assert.equal(client1.getPosition(segoff.segment), 2);
        assert.equal(segoff.offset, 0);

        // On a removed, unacked segment, end of string
        remove = client1.makeOpMessage(
            client1.removeRangeLocal(2, 3),
            ++seq);
        segoff = client1.getSlideOnRemoveReferencePosition(3, createReference2);
        assert(segoff.segment);
        assert.notEqual(toRemovalInfo(segoff.segment), undefined);
        assert.equal(client1.getPosition(segoff.segment), 2);
        assert.equal(segoff.offset, 0);

        // Slid from a removed, acked segment, end of string
        client1.applyMsg(remove);
        segoff = client1.getSlideOnRemoveReferencePosition(3, createReference2);
        assert(segoff.segment);
        assert.equal(toRemovalInfo(segoff.segment), undefined);
        assert.equal(client1.getPosition(segoff.segment), 0);
        assert.equal(segoff.offset, 1);
    });

    it("Remove all segments with sliding local reference", () => {
        const client1 = new TestClient();
        const client2 = new TestClient();

        client1.startOrUpdateCollaboration("1");
        client2.startOrUpdateCollaboration("2");
        let seq = 0;
        for (let i = 0; i < 5; i++) {
            const insert =
                client1.makeOpMessage(
                    client1.insertTextLocal(client1.getLength(), i.toString()),
                    ++seq);
            insert.minimumSequenceNumber = seq - 1;
            client1.applyMsg(insert);
            client2.applyMsg(insert);
        }

        const segInfo = client1.getContainingSegment(2);
        const c1LocalRef = client1.createLocalReferencePosition(
            segInfo.segment!, segInfo.offset!, ReferenceType.SlideOnRemove, undefined);

        assert.equal(client1.localReferencePositionToPosition(c1LocalRef), 2);

        const remove =
            client2.makeOpMessage(
                client2.removeRangeLocal(0, client2.getLength()),
                ++seq);
        remove.minimumSequenceNumber = seq - 1;
        client1.applyMsg(remove);
        client2.applyMsg(remove);

        assert.equal(client1.localReferencePositionToPosition(c1LocalRef), -1);
    });

    it("Split segment with no references and append to segment with references", () => {
        const clients = createClientsAtInitialState("", "A", "B");

        const messages: ISequencedDocumentMessage[] = [];
        let seq = 0;
        messages.push(clients.A.makeOpMessage(clients.A.insertTextLocal(0, "0123456789"), ++seq));
        // initialize the local reference collection on the segment, but keep it empty
        {
            const segInfo = clients.A.getContainingSegment(9);
            const segment = segInfo.segment;
            assert(TextSegment.is(segment!));
            assert.strictEqual(segment.text[segInfo.offset!], "9");
            const localRef = clients.A.createLocalReferencePosition(
                segment, segInfo.offset!, ReferenceType.Simple, undefined);
            clients.A.removeLocalReferencePosition(localRef);
        }
        // split the segment
        messages.push(clients.A.makeOpMessage(clients.A.insertTextLocal(5, "ABCD"), ++seq));

        // add a local reference to the newly inserted segment that caused the split
        {
            const segInfo = clients.A.getContainingSegment(6);
            const segment = segInfo.segment;
            assert(TextSegment.is(segment!));
            assert.strictEqual(segment.text[segInfo.offset!], "B");
            clients.A.createLocalReferencePosition(
                segment, segInfo.offset!, ReferenceType.Simple, undefined);
        }
        // apply all the ops
        while (messages.length > 0) {
            const msg = messages.shift()!;
            clients.all.forEach((c) => c.applyMsg(msg));
        }

        // regression: would fire 0x2be on zamboni during segment append
        clients.all.forEach((c) => c.updateMinSeq(seq));
    });
});
