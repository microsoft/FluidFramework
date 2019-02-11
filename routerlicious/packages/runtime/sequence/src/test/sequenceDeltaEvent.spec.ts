import {
    Client,
    IMergeTreeDeltaCallbackArgs,
} from "@prague/merge-tree";
import * as assert from "assert";
import { SequenceDeltaEvent } from "../sequenceDeltaEvent";

describe("SequenceDeltaEvent", () => {

    const localUserLongId = "localUser";
    let client: Client;

    beforeEach(() => {
        client = new Client("");
        client.startCollaboration(localUserLongId);
    });

    describe(".ranges", () => {
        it("single segment", () => {
            const insertText = "text";
            let deltaArgs: IMergeTreeDeltaCallbackArgs;
            client.mergeTree.mergeTreeDeltaCallback = (op, delta) => { deltaArgs = delta; };
            client.insertTextLocal(insertText, 0);

            assert(deltaArgs);
            assert.equal(deltaArgs.segments.length, 1);

            const event = new SequenceDeltaEvent(undefined, client, deltaArgs);

            assert(event.isLocal);
            assert(!event.isEmpty);
            assert.equal(event.ranges.length, 1);
            assert.equal(event.start, 0);
            assert.equal(event.ranges[0].start, 0);
            assert.equal(event.ranges[0].length, insertText.length);
            assert.equal(event.end, insertText.length);
        });

        it("multiple continuous segments", () => {
            const insertText = "text";
            const segmentCount = 5;
            for (let i = 0; i < segmentCount + 2; i = i + 1) {
                client.insertTextLocal(insertText, 0);
            }

            let deltaArgs: IMergeTreeDeltaCallbackArgs;
            client.mergeTree.mergeTreeDeltaCallback = (op, delta) => { deltaArgs = delta; };
            client.annotateSegmentLocal(
                {
                    foo: "bar",
                },
                insertText.length,
                client.getLength() - insertText.length,
                undefined);

            assert(deltaArgs);
            assert.equal(deltaArgs.segments.length, segmentCount);

            const event = new SequenceDeltaEvent(undefined, client, deltaArgs);

            assert(event.isLocal);
            assert(!event.isEmpty);
            assert.equal(event.ranges.length, 1);
            assert.equal(event.start, insertText.length);
            assert.equal(event.ranges[0].start, insertText.length);
            assert.equal(event.ranges[0].length, client.getLength() - insertText.length * 2);
            assert.equal(event.end, client.getLength() - insertText.length);
        });

        it("multiple noncontinuous segments", () => {
            const textCount = 4;
            const segmentCount = 5;
            for (let i = 0; i < segmentCount; i = i + 1) {
                client.insertTextLocal(`${i}`.repeat(textCount), 0);
                const insertMessage = client.makeInsertMsg(
                    `${i}`.repeat(textCount),
                    0,
                    client.mergeTree.collabWindow.currentSeq + 1,
                    client.mergeTree.collabWindow.currentSeq,
                    undefined);
                client.applyMsg(insertMessage);
            }
            console.log(client.getText());

            const remoteRemoveMessage = client.makeRemoveMsg(
                0,
                client.getLength(),
                client.mergeTree.collabWindow.currentSeq + 1,
                client.mergeTree.collabWindow.currentSeq,
                undefined);
            remoteRemoveMessage.clientSequenceNumber = 0;
            remoteRemoveMessage.clientId = "remote user";

            for (let i = 0; i < segmentCount; i = i + 1) {
                client.insertTextLocal("b".repeat(textCount), i * 2 * textCount);
            }
            console.log(client.getText());

            let event: SequenceDeltaEvent;
            client.mergeTree.mergeTreeDeltaCallback = (clientArgs, mergeTreeArgs) => {
                event = new SequenceDeltaEvent(clientArgs, client, mergeTreeArgs);
            };
            client.applyMsg(remoteRemoveMessage);

            assert(!event.isLocal);
            assert(!event.isEmpty);
            assert.equal(event.ranges.length, segmentCount);
            for (let i = 0; i < segmentCount; i = i + 1) {
                assert.equal(event.ranges[i].start,  (i + 1) * textCount);
                assert.equal(event.ranges[i].length, textCount);
            }
        });
    });
});
