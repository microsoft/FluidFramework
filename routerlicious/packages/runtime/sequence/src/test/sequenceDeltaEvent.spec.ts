import { ITree } from "@prague/container-definitions";
import { createRemoveRangeOp, IMergeTreeDeltaCallbackArgs, TextSegment } from "@prague/merge-tree";
import {
    MockStorage,
    TestClient,
// tslint:disable-next-line:no-submodule-imports
} from "@prague/merge-tree/dist/test/";
import * as assert from "assert";
import { SequenceDeltaEvent } from "../sequenceDeltaEvent";
import { SharedString } from "../sharedString";
import * as mocks from "./mocks";

describe("SequenceDeltaEvent", () => {

    const documentId = "fakeId";
    const localUserLongId = "localUser";
    let runtime: mocks.MockRuntime;
    let client: TestClient;

    beforeEach(() => {
        client = new TestClient("");
        client.startCollaboration(localUserLongId);
        runtime = new mocks.MockRuntime();
    });

    describe(".ranges", () => {
        it("single segment", () => {
            const insertText = "text";
            let deltaArgs: IMergeTreeDeltaCallbackArgs;
            client.mergeTree.mergeTreeDeltaCallback = (op, delta) => { deltaArgs = delta; };
            client.insertTextLocal(0, insertText);

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

        it("snapshots", async () => {
            const insertText = "text";
            const segmentCount = 1000;

            const sharedString = new SharedString(runtime, documentId);
            sharedString.client.mergeTree.collabWindow.collaborating = false;

            for (let i = 0; i < segmentCount; i = i + 1) {
                sharedString.client.insertSegmentLocal(0, new TextSegment(`${insertText}${i}`));
            }

            let tree = sharedString.snapshot();
            assert(tree.entries.length === 2);
            assert(tree.entries[0].path === "header");
            assert(tree.entries[1].path === "content");
            let subTree = tree.entries[1].value as ITree;
            assert(subTree.entries.length === 2);
            assert(subTree.entries[0].path === "header");
            assert(subTree.entries[1].path === "tardis");

            await CreateStringAndCompare(sharedString, tree);

            for (let i = 0; i < segmentCount; i = i + 1) {
                sharedString.client.insertSegmentLocal(0, new TextSegment(`${insertText}-${i}`));
            }

            tree = sharedString.snapshot();
            assert(tree.entries.length === 2);
            assert(tree.entries[0].path === "header");
            assert(tree.entries[1].path === "content");
            subTree = tree.entries[1].value as ITree;
            assert(subTree.entries.length === 3);
            assert(subTree.entries[0].path === "header");
            assert(subTree.entries[1].path === "body");
            assert(subTree.entries[2].path === "tardis");

            await CreateStringAndCompare(sharedString, tree);
        });

        async function CreateStringAndCompare(sharedString: SharedString, tree: ITree): Promise<void> {
            const services = {
                deltaConnection: new mocks.MockDeltaConnection(),
                objectStorage: new MockStorage(tree),
            };

            const sharedString2 = new SharedString(runtime, documentId, services);
            await sharedString2.load(0, null/*headerOrigin*/, services);

            assert(sharedString.getText() === sharedString2.getText());
        }
    });
});
