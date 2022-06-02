/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
/* eslint-disable @typescript-eslint/no-non-null-assertion */

import { strict as assert } from "assert";
import { ISequencedDocumentMessage } from "@fluidframework/protocol-definitions";
import { ReferenceType } from "../ops";
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
