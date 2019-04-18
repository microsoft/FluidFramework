import { createRemoveRangeOp, IMergeTreeDeltaCallbackArgs } from "@prague/merge-tree";
import {
    TestClient,
// tslint:disable-next-line:no-submodule-imports
} from "@prague/merge-tree/dist/test/";
import * as assert from "assert";
import { SequenceDeltaEvent } from "../sequenceDeltaEvent";

describe("SequenceDeltaEvent", () => {

    const localUserLongId = "localUser";
    let client: TestClient;

    beforeEach(() => {
        client = new TestClient("");
        client.startCollaboration(localUserLongId);
    });

    describe(".ranges", () => {
        it("single segment", () => {
            const insertText = "text";
            let deltaArgs: IMergeTreeDeltaCallbackArgs;
            client.mergeTree.mergeTreeDeltaCallback = (op, delta) => { deltaArgs = delta; };
            client.insertTextLocal(0, insertText);

            assert(deltaArgs);
            assert.equal(deltaArgs.deltaSegments.length, 1);

            const event = new SequenceDeltaEvent(undefined, deltaArgs, client);

            assert(event.isLocal);
            assert(!event.isEmpty);
            assert.equal(event.ranges.length, 1);
            assert.equal(event.start, 0);
            assert.equal(event.ranges[0].offset, 0);
            assert.equal(event.ranges[0].segment.cachedLength, insertText.length);
            assert.equal(event.end, insertText.length);
        });

        it("multiple continuous segments", () => {
            const insertText = "text";
            const segmentCount = 5;
            for (let i = 0; i < segmentCount + 2; i = i + 1) {
                client.insertTextLocal(0, insertText);
            }

            let deltaArgs: IMergeTreeDeltaCallbackArgs;
            client.mergeTree.mergeTreeDeltaCallback = (op, delta) => { deltaArgs = delta; };
            client.annotateRangeLocal(
                insertText.length,
                client.getLength() - insertText.length,
                {
                    foo: "bar",
                },
                undefined);

            assert(deltaArgs);
            assert.equal(deltaArgs.deltaSegments.length, segmentCount);

            const event = new SequenceDeltaEvent(undefined, deltaArgs, client);

            assert(event.isLocal);
            assert(!event.isEmpty);
            assert.equal(event.ranges.length, segmentCount);
            assert.equal(event.start, insertText.length);
            assert.equal(event.ranges[0].offset, insertText.length);
            for (let i = 0; i < segmentCount; i = i + 1) {
                assert.equal(event.ranges[i].offset, (i + 1) * insertText.length);
                assert.equal(event.ranges[i].segment.cachedLength, insertText.length);
                assert.equal(event.ranges[i].propertyDeltas.length, 1);
                assert.equal(event.ranges[i].propertyDeltas[0].key, "foo");
                assert.equal(event.ranges[i].propertyDeltas[0].previousValue, undefined);
            }
            assert.equal(event.end, client.getLength() - insertText.length);
        });

        it("multiple noncontinuous segments", () => {
            const textCount = 4;
            const segmentCount = 5;
            for (let i = 0; i < segmentCount; i = i + 1) {
                const op = client.insertTextLocal(0, `${i}`.repeat(textCount));
                client.applyMsg(client.makeOpMessage(op, client.mergeTree.collabWindow.currentSeq + 1));
            }
            console.log(client.getText());

            const remoteRemoveMessage = client.makeOpMessage(
                createRemoveRangeOp(0, client.getLength()),
                client.mergeTree.collabWindow.currentSeq + 1);
            remoteRemoveMessage.clientSequenceNumber = 0;
            remoteRemoveMessage.clientId = "remote user";

            for (let i = 0; i < segmentCount; i = i + 1) {
                client.insertTextLocal(i * 2 * textCount, "b".repeat(textCount));
            }
            console.log(client.getText());

            let event: SequenceDeltaEvent;
            client.mergeTree.mergeTreeDeltaCallback = (clientArgs, mergeTreeArgs) => {
                event = new SequenceDeltaEvent(clientArgs, mergeTreeArgs, client);
            };
            client.applyMsg(remoteRemoveMessage);

            assert(!event.isLocal);
            assert(!event.isEmpty);
            assert.equal(event.ranges.length, segmentCount);
            for (let i = 0; i < segmentCount; i = i + 1) {
                assert.equal(event.ranges[i].offset, (i + 1) * textCount);
                assert.equal(event.ranges[i].segment.cachedLength, textCount);
                assert.equal(event.ranges[i].propertyDeltas.length, 0);
            }
        });
    });
});
