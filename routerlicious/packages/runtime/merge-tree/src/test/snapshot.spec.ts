import * as assert from "assert";
import { MockStorage, specToSegment, TestClient } from ".";
import { Client,  UniversalSequenceNumber } from "..";
import { Snapshot } from "../snapshot";

describe("snapshot", () => {
    it("header only", async () => {

        const client1 = new TestClient("");
        client1.startCollaboration("me");
        for (let i = 0; i < Snapshot.sizeOfFirstChunk; i++) {
            const op = client1.insertTextLocal(client1.getLength(), `${i % 10}`,  { segment: i });
            client1.applyMsg(client1.makeOpMessage(op, i + 1));
        }
        client1.updateMinSeq(Snapshot.sizeOfFirstChunk);

        const snapshot = new Snapshot(client1.mergeTree);
        snapshot.extractSync();
        const snapshotTree = snapshot.emit();
        const services = new MockStorage(snapshotTree);

        const client2 = new Client("", specToSegment);

        const headerChunk = await Snapshot.loadChunk(services, "header");
        client2.mergeTree.reloadFromSegments(headerChunk.segmentTexts.map(specToSegment));

        assert.equal(client2.getLength(), client1.getLength());
        assert.equal(client2.getText(), client1.getText());
    });

    it("header and body", async () => {

        const client1 = new TestClient("");
        client1.startCollaboration("me");
        for (let i = 0; i < Snapshot.sizeOfFirstChunk + 100; i++) {
            const op = client1.insertTextLocal(client1.getLength(), `${i % 10}`,  { segment: i });
            client1.applyMsg(client1.makeOpMessage(op, i + 1));
        }
        client1.updateMinSeq(Snapshot.sizeOfFirstChunk + 100);

        const snapshot = new Snapshot(client1.mergeTree);
        snapshot.extractSync();
        const snapshotTree = snapshot.emit();
        const services = new MockStorage(snapshotTree);

        const client2 = new Client("", specToSegment);

        const headerChunk = await Snapshot.loadChunk(services, "header");
        client2.mergeTree.reloadFromSegments(headerChunk.segmentTexts.map(specToSegment));

        const bodyChunk = await Snapshot.loadChunk(services, "body");
        client2.mergeTree.insertSegments(
            client2.mergeTree.root.cachedLength,
            bodyChunk.segmentTexts.map(specToSegment),
            UniversalSequenceNumber,
            client2.mergeTree.collabWindow.clientId,
            UniversalSequenceNumber,
            undefined);

        assert.equal(client2.getLength(), client1.getLength());
        assert.equal(client2.getText(), client1.getText());
    });
})
// seeing timeouts in automation
.timeout(5000);
