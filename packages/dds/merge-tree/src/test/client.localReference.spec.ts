/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { LocalReference } from "../localReference";
import { ReferenceType } from "../ops";
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
        const c1LocalRef = new LocalReference(client1, segInfo.segment, segInfo.offset, ReferenceType.Simple);
        client1.addLocalReference(c1LocalRef);

        assert.equal(c1LocalRef.toPosition(), 2);

        const remove =
            client2.makeOpMessage(
                client2.removeRangeLocal(2, 3),
                ++seq);
        remove.minimumSequenceNumber = seq - 1;
        client1.applyMsg(remove);
        client2.applyMsg(remove);

        // this only works because zamboni hasn't run yet
        assert.equal(c1LocalRef.toPosition(), -1);

        // this will force zamoni to run
        for (let i = 0; i < 5; i++) {
            const insert =
                client1.makeOpMessage(
                    client1.insertTextLocal(client1.getLength(), i.toString()),
                    ++seq);
            insert.minimumSequenceNumber = seq - 1;
            client1.applyMsg(insert);
            client2.applyMsg(insert);
        }
        assert.equal(c1LocalRef.segment, undefined);
        assert.equal(c1LocalRef.toPosition(), -1);
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
        const c1LocalRef = new LocalReference(client1, segInfo.segment, segInfo.offset, ReferenceType.SlideOnRemove);
        client1.addLocalReference(c1LocalRef);

        assert.equal(c1LocalRef.toPosition(), 2);

        const remove =
            client2.makeOpMessage(
                client2.removeRangeLocal(2, 3),
                ++seq);
        remove.minimumSequenceNumber = seq - 1;
        client1.applyMsg(remove);
        client2.applyMsg(remove);

        assert.equal(c1LocalRef.toPosition(), 2);

        for (let i = 0; i < 5; i++) {
            const insert =
                client1.makeOpMessage(
                    client1.insertTextLocal(client1.getLength(), i.toString()),
                    ++seq);
            insert.minimumSequenceNumber = seq - 1;
            client1.applyMsg(insert);
            client2.applyMsg(insert);
        }

        assert.equal(c1LocalRef.toPosition(), 2);
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
        const c1LocalRef = new LocalReference(client1, segInfo.segment, segInfo.offset, ReferenceType.SlideOnRemove);
        client1.addLocalReference(c1LocalRef);

        assert.equal(c1LocalRef.toPosition(), 2);

        const remove =
            client2.makeOpMessage(
                client2.removeRangeLocal(2, client2.getLength()),
                ++seq);
        remove.minimumSequenceNumber = seq - 1;
        client1.applyMsg(remove);
        client2.applyMsg(remove);

        assert.equal(c1LocalRef.toPosition(), client2.getLength() - 1);
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
        const c1LocalRef = new LocalReference(client1, segInfo.segment, segInfo.offset, ReferenceType.SlideOnRemove);
        client1.addLocalReference(c1LocalRef);

        assert.equal(c1LocalRef.toPosition(), 2);

        const remove =
            client2.makeOpMessage(
                client2.removeRangeLocal(0, client2.getLength()),
                ++seq);
        remove.minimumSequenceNumber = seq - 1;
        client1.applyMsg(remove);
        client2.applyMsg(remove);

        assert.equal(c1LocalRef.toPosition(), -1);
    });
});
