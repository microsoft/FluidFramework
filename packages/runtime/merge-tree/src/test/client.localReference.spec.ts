import * as assert from "assert";
import { TestClient } from ".";
import { LocalReference } from "../mergeTree";
import { ReferenceType } from "../ops";

describe("MergeTree.Client", () => {

    it("Remove segment of non-sliding local reference", () => {
        const client1 = new TestClient();
        const client2 = new TestClient();

        client1.startCollaboration("1");
        client2.startCollaboration("2");
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

        const segInfo = client1.mergeTree.getContainingSegment(2, seq, client1.getClientId());
        const c1LocalRef = new LocalReference(segInfo.segment, segInfo.offset, ReferenceType.Simple);
        segInfo.segment.addLocalRef(c1LocalRef);

        assert.equal(c1LocalRef.toPosition(client1.mergeTree, seq, client1.getClientId()), 2);

        const remove =
            client2.makeOpMessage(
                client2.removeRangeLocal(2, 3),
                ++seq);
        remove.minimumSequenceNumber = seq - 1;
        client1.applyMsg(remove);
        client2.applyMsg(remove);

        // this only works because zamboni hasn't run yet
        assert.equal(c1LocalRef.toPosition(client1.mergeTree, seq, client1.getClientId()), 2);

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
        assert.equal(c1LocalRef.segment.parent, undefined);
        assert.equal(c1LocalRef.toPosition(client1.mergeTree, seq, client1.getClientId()), 0);
    });

    it("Remove segment of sliding local reference", () => {
        const client1 = new TestClient();
        const client2 = new TestClient();

        client1.startCollaboration("1");
        client2.startCollaboration("2");
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

        const segInfo = client1.mergeTree.getContainingSegment(2, seq, client1.getClientId());
        const c1LocalRef = new LocalReference(segInfo.segment, segInfo.offset, ReferenceType.SlideOnRemove);
        segInfo.segment.addLocalRef(c1LocalRef);

        assert.equal(c1LocalRef.toPosition(client1.mergeTree, seq, client1.getClientId()), 2);

        const remove =
            client2.makeOpMessage(
                client2.removeRangeLocal(2, 3),
                ++seq);
        remove.minimumSequenceNumber = seq - 1;
        client1.applyMsg(remove);
        client2.applyMsg(remove);

        assert.equal(c1LocalRef.toPosition(client1.mergeTree, seq, client1.getClientId()), 2);

        for (let i = 0; i < 5; i++) {
            const insert =
                client1.makeOpMessage(
                    client1.insertTextLocal(client1.getLength(), i.toString()),
                    ++seq);
            insert.minimumSequenceNumber = seq - 1;
            client1.applyMsg(insert);
            client2.applyMsg(insert);
        }

        assert.equal(c1LocalRef.toPosition(client1.mergeTree, seq, client1.getClientId()), 2);
    });
});
