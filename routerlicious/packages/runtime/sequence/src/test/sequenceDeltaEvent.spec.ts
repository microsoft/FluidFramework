import { ITree } from "@prague/container-definitions";
import { Client, IMergeTreeDeltaCallbackArgs } from "@prague/merge-tree";
import * as assert from "assert";
import { SequenceDeltaEvent } from "../sequenceDeltaEvent";
import { SharedString } from "../sharedString";
import * as mocks from "./mocks";
import { insertTextLocal, specToSegment } from "./testUtils";

describe("SequenceDeltaEvent", () => {

    const documentId = "fakeId";
    const localUserLongId = "localUser";
    let runtime: mocks.MockRuntime;
    let client: Client;

    beforeEach(() => {
        client = new Client("", specToSegment);
        client.startCollaboration(localUserLongId);
        runtime = new mocks.MockRuntime();
    });

    describe(".ranges", () => {
        it("single segment", () => {
            const insertText = "text";
            let deltaArgs: IMergeTreeDeltaCallbackArgs;
            client.mergeTree.mergeTreeDeltaCallback = (op, delta) => { deltaArgs = delta; };
            insertTextLocal(client, insertText, 0);

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
                insertTextLocal(client, insertText, 0);
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
                insertTextLocal(client, `${i}`.repeat(textCount), 0);
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
                insertTextLocal(client, "b".repeat(textCount), i * 2 * textCount);
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
                insertTextLocal(sharedString.client, `${insertText}${i}`, 0);
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
                insertTextLocal(sharedString.client, `${insertText}-${i}`, 0);
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
                objectStorage: new mocks.MockStorage(tree),
            };

            const sharedString2 = new SharedString(runtime, documentId, services);
            await sharedString2.load(0, null/*headerOrigin*/, services);

            assert(sharedString.getText() === sharedString2.getText());
        }
    });
});
