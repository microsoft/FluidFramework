/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { EventEmitter } from "events";
import { DebugLogger } from "@fluidframework/telemetry-utils";
import {
    IDocumentMessage,
    ISequencedDocumentMessage,
    ISnapshotTree,
    MessageType,
} from "@fluidframework/protocol-definitions";
import { IDeltaManager } from "@fluidframework/container-definitions";
import { MockDeltaManager } from "@fluidframework/test-runtime-utils";
import { channelsTreeName } from "@fluidframework/runtime-definitions";
import { getSnapshotForDataStores, ScheduleManager } from "../containerRuntime";
import { nonDataStorePaths } from "../snapshot";

describe("Runtime", () => {
    describe("Container Runtime", () => {
        describe("ScheduleManager", () => {
            describe("Batch processing events", () => {
                let batchBegin: number = 0;
                let batchEnd: number = 0;
                let emitter: EventEmitter;
                let deltaManager: IDeltaManager<ISequencedDocumentMessage, IDocumentMessage>;
                let scheduleManager: ScheduleManager;

                beforeEach(() => {
                    emitter = new EventEmitter();
                    deltaManager = new MockDeltaManager();
                    scheduleManager = new ScheduleManager(
                        deltaManager,
                        emitter,
                        DebugLogger.create("fluid:testScheduleManager"),
                    );

                    emitter.on("batchBegin", () => {
                        // When we receive a "batchBegin" event, we should not have any outstanding
                        // events, i.e., batchBegin and batchEnd should be equal.
                        assert.strictEqual(batchBegin, batchEnd, "Received batchBegin before previous batchEnd");
                        batchBegin++;
                    });

                    emitter.on("batchEnd", () => {
                        batchEnd++;
                        // Every "batchEnd" event should correspond to a "batchBegin" event, i.e.,
                        // batchBegin and batchEnd should be equal.
                        assert.strictEqual(batchBegin, batchEnd, "Received batchEnd without corresponding batchBegin");
                    });
                });

                afterEach(() => {
                    batchBegin = 0;
                    batchEnd = 0;
                });

                it("Single non-batch message", () => {
                    const clientId: string = "test-client";
                    const message: Partial<ISequencedDocumentMessage> = {
                        clientId,
                        sequenceNumber: 0,
                        type: MessageType.Operation,
                    };

                    // Send a non-batch message.
                    scheduleManager.beginOperation(message as ISequencedDocumentMessage);
                    scheduleManager.endOperation(undefined, message as ISequencedDocumentMessage);

                    assert.strictEqual(1, batchBegin, "Did not receive correct batchBegin events");
                    assert.strictEqual(1, batchEnd, "Did not receive correct batchEnd events");
                });

                it("Multiple non-batch messages", () => {
                    const clientId: string = "test-client";
                    const message: Partial<ISequencedDocumentMessage> = {
                        clientId,
                        sequenceNumber: 0,
                        type: MessageType.Operation,
                    };

                    // Sent 5 non-batch messages.
                    scheduleManager.beginOperation(message as ISequencedDocumentMessage);
                    scheduleManager.endOperation(undefined, message as ISequencedDocumentMessage);

                    scheduleManager.beginOperation(message as ISequencedDocumentMessage);
                    scheduleManager.endOperation(undefined, message as ISequencedDocumentMessage);

                    scheduleManager.beginOperation(message as ISequencedDocumentMessage);
                    scheduleManager.endOperation(undefined, message as ISequencedDocumentMessage);

                    scheduleManager.beginOperation(message as ISequencedDocumentMessage);
                    scheduleManager.endOperation(undefined, message as ISequencedDocumentMessage);

                    scheduleManager.beginOperation(message as ISequencedDocumentMessage);
                    scheduleManager.endOperation(undefined, message as ISequencedDocumentMessage);

                    assert.strictEqual(5, batchBegin, "Did not receive correct batchBegin events");
                    assert.strictEqual(5, batchEnd, "Did not receive correct batchEnd events");
                });

                it("Message with non batch-related metadata", () => {
                    const clientId: string = "test-client";
                    const message: Partial<ISequencedDocumentMessage> = {
                        clientId,
                        sequenceNumber: 0,
                        type: MessageType.Operation,
                        metadata: { foo: 1 },
                    };

                    scheduleManager.beginOperation(message as ISequencedDocumentMessage);
                    scheduleManager.endOperation(undefined, message as ISequencedDocumentMessage);

                    // We should have a "batchBegin" and a "batchEnd" event for the batch.
                    assert.strictEqual(1, batchBegin, "Did not receive correct batchBegin event for the batch");
                    assert.strictEqual(1, batchEnd, "Did not receive correct batchEnd event for the batch");
                });

                it("Messages in a single batch", () => {
                    const clientId: string = "test-client";
                    const batchBeginMessage: Partial<ISequencedDocumentMessage> = {
                        clientId,
                        sequenceNumber: 0,
                        type: MessageType.Operation,
                        metadata: { batch: true },
                    };

                    const batchMessage: Partial<ISequencedDocumentMessage> = {
                        clientId,
                        sequenceNumber: 0,
                        type: MessageType.Operation,
                    };

                    const batchEndMessage: Partial<ISequencedDocumentMessage> = {
                        clientId,
                        sequenceNumber: 0,
                        type: MessageType.Operation,
                        metadata: { batch: false },
                    };

                    // Send a batch with 4 messages.
                    scheduleManager.beginOperation(batchBeginMessage as ISequencedDocumentMessage);
                    scheduleManager.endOperation(undefined, batchBeginMessage as ISequencedDocumentMessage);

                    scheduleManager.beginOperation(batchMessage as ISequencedDocumentMessage);
                    scheduleManager.endOperation(undefined, batchMessage as ISequencedDocumentMessage);

                    scheduleManager.beginOperation(batchMessage as ISequencedDocumentMessage);
                    scheduleManager.endOperation(undefined, batchMessage as ISequencedDocumentMessage);

                    scheduleManager.beginOperation(batchEndMessage as ISequencedDocumentMessage);
                    scheduleManager.endOperation(undefined, batchEndMessage as ISequencedDocumentMessage);

                    // We should have only received one "batchBegin" and one "batchEnd" event for the batch.
                    assert.strictEqual(1, batchBegin, "Did not receive correct batchBegin event for the batch");
                    assert.strictEqual(1, batchEnd, "Did not receive correct batchEnd event for the batch");
                });

                it("Partial batch messages followed by a non-batch message from another client", () => {
                    const clientId1: string = "test-client-1";
                    const clientId2: string = "test-client-2";
                    const batchBeginMessage: Partial<ISequencedDocumentMessage> = {
                        clientId: clientId1,
                        sequenceNumber: 0,
                        type: MessageType.Operation,
                        metadata: { batch: true },
                    };

                    const batchMessage: Partial<ISequencedDocumentMessage> = {
                        clientId: clientId1,
                        sequenceNumber: 0,
                        type: MessageType.Operation,
                    };

                    // Send a batch with 3 messages from first client but don't send batch end message.
                    scheduleManager.beginOperation(batchBeginMessage as ISequencedDocumentMessage);
                    scheduleManager.endOperation(undefined, batchBeginMessage as ISequencedDocumentMessage);

                    scheduleManager.beginOperation(batchMessage as ISequencedDocumentMessage);
                    scheduleManager.endOperation(undefined, batchMessage as ISequencedDocumentMessage);

                    scheduleManager.beginOperation(batchMessage as ISequencedDocumentMessage);
                    scheduleManager.endOperation(undefined, batchMessage as ISequencedDocumentMessage);

                    // Send a message from another client. This should result in a "batchEnd" event for the
                    // previous batch since the client id changes. Also, we should get a "batchBegin" and
                    // a "batchEnd" event for the new client.
                    const client2Message: Partial<ISequencedDocumentMessage> = {
                        clientId: clientId2,
                        sequenceNumber: 0,
                        type: MessageType.Operation,
                    };

                    scheduleManager.beginOperation(client2Message as ISequencedDocumentMessage);
                    scheduleManager.endOperation(undefined, client2Message as ISequencedDocumentMessage);

                    // We should have received two sets of "batchBegin" and "batchEnd" events.
                    assert.strictEqual(2, batchBegin, "Did not receive correct batchBegin event for the batch");
                    assert.strictEqual(2, batchEnd, "Did not receive correct batchBegin event for the batch");
                });

                it("Partial batch messages followed by non batch-related metadata message from another client", () => {
                    const clientId1: string = "test-client-1";
                    const clientId2: string = "test-client-2";
                    const batchBeginMessage: Partial<ISequencedDocumentMessage> = {
                        clientId: clientId1,
                        sequenceNumber: 0,
                        type: MessageType.Operation,
                        metadata: { batch: true },
                    };

                    const batchMessage: Partial<ISequencedDocumentMessage> = {
                        clientId: clientId1,
                        sequenceNumber: 0,
                        type: MessageType.Operation,
                    };

                    // Send a batch with 3 messages from first client but don't send batch end message.
                    scheduleManager.beginOperation(batchBeginMessage as ISequencedDocumentMessage);
                    scheduleManager.endOperation(undefined, batchBeginMessage as ISequencedDocumentMessage);

                    scheduleManager.beginOperation(batchMessage as ISequencedDocumentMessage);
                    scheduleManager.endOperation(undefined, batchMessage as ISequencedDocumentMessage);

                    scheduleManager.beginOperation(batchMessage as ISequencedDocumentMessage);
                    scheduleManager.endOperation(undefined, batchMessage as ISequencedDocumentMessage);

                    // Send a message from another client with non batch-related metadata. This should result
                    // in a "batchEnd" event for the previous batch since the client id changes. Also, we
                    // should get a "batchBegin" and a "batchEnd" event for the new client.
                    const client2Message: Partial<ISequencedDocumentMessage> = {
                        clientId: clientId2,
                        sequenceNumber: 0,
                        type: MessageType.Operation,
                        metadata: { foo: 1 },
                    };

                    scheduleManager.beginOperation(client2Message as ISequencedDocumentMessage);
                    scheduleManager.endOperation(undefined, client2Message as ISequencedDocumentMessage);

                    // We should have received two sets of "batchBegin" and "batchEnd" events.
                    assert.strictEqual(2, batchBegin, "Did not receive correct batchBegin event for the batch");
                    assert.strictEqual(2, batchEnd, "Did not receive correct batchBegin event for the batch");
                });

                it("Partial batch messages followed by batch messages from another client", () => {
                    const clientId1: string = "test-client-1";
                    const clientId2: string = "test-client-2";
                    const client1batchBeginMessage: Partial<ISequencedDocumentMessage> = {
                        clientId: clientId1,
                        sequenceNumber: 0,
                        type: MessageType.Operation,
                        metadata: { batch: true },
                    };

                    const client1batchMessage: Partial<ISequencedDocumentMessage> = {
                        clientId: clientId1,
                        sequenceNumber: 0,
                        type: MessageType.Operation,
                    };

                    // Send a batch with 3 messages from first client but don't send batch end message.
                    scheduleManager.beginOperation(client1batchBeginMessage as ISequencedDocumentMessage);
                    scheduleManager.endOperation(undefined, client1batchBeginMessage as ISequencedDocumentMessage);

                    scheduleManager.beginOperation(client1batchMessage as ISequencedDocumentMessage);
                    scheduleManager.endOperation(undefined, client1batchMessage as ISequencedDocumentMessage);

                    scheduleManager.beginOperation(client1batchMessage as ISequencedDocumentMessage);
                    scheduleManager.endOperation(undefined, client1batchMessage as ISequencedDocumentMessage);

                    // Send a batch from another client. This should result in a "batchEnd" event for the
                    // previous batch since the client id changes. Also, we should get one "batchBegin" and
                    // one "batchEnd" event for the batch from the new client.
                    const client2batchBeginMessage: Partial<ISequencedDocumentMessage> = {
                        clientId: clientId2,
                        sequenceNumber: 0,
                        type: MessageType.Operation,
                        metadata: { batch: true },
                    };

                    const client2batchMessage: Partial<ISequencedDocumentMessage> = {
                        clientId: clientId2,
                        sequenceNumber: 0,
                        type: MessageType.Operation,
                    };

                    const client2batchEndMessage: Partial<ISequencedDocumentMessage> = {
                        clientId: clientId2,
                        sequenceNumber: 0,
                        type: MessageType.Operation,
                        metadata: { batch: false },
                    };

                    scheduleManager.beginOperation(client2batchBeginMessage as ISequencedDocumentMessage);
                    scheduleManager.endOperation(undefined, client2batchBeginMessage as ISequencedDocumentMessage);

                    scheduleManager.beginOperation(client2batchMessage as ISequencedDocumentMessage);
                    scheduleManager.endOperation(undefined, client2batchMessage as ISequencedDocumentMessage);

                    scheduleManager.beginOperation(client2batchEndMessage as ISequencedDocumentMessage);
                    scheduleManager.endOperation(undefined, client2batchEndMessage as ISequencedDocumentMessage);

                    // We should have received two sets of "batchBegin" and one "batchEnd" events.
                    assert.strictEqual(2, batchBegin, "Did not receive correct batchBegin event for the batches");
                    assert.strictEqual(2, batchEnd, "Did not receive correct batchBegin event for the batches");
                });

                it("Batch messages interleaved with a batch begin message from same client", () => {
                    const clientId: string = "test-client";
                    const batchBeginMessage: Partial<ISequencedDocumentMessage> = {
                        clientId,
                        sequenceNumber: 0,
                        type: MessageType.Operation,
                        metadata: { batch: true },
                    };

                    const batchMessage: Partial<ISequencedDocumentMessage> = {
                        clientId,
                        sequenceNumber: 0,
                        type: MessageType.Operation,
                    };

                    const batchEndMessage: Partial<ISequencedDocumentMessage> = {
                        clientId,
                        sequenceNumber: 0,
                        type: MessageType.Operation,
                        metadata: { batch: false },
                    };

                    // Send a batch with an interleaved batch begin message.
                    scheduleManager.beginOperation(batchBeginMessage as ISequencedDocumentMessage);
                    scheduleManager.endOperation(undefined, batchBeginMessage as ISequencedDocumentMessage);

                    scheduleManager.beginOperation(batchMessage as ISequencedDocumentMessage);
                    scheduleManager.endOperation(undefined, batchMessage as ISequencedDocumentMessage);

                    scheduleManager.beginOperation(batchMessage as ISequencedDocumentMessage);
                    scheduleManager.endOperation(undefined, batchMessage as ISequencedDocumentMessage);

                    // The interleaved batch begin message. We should not get a "batchBegin" event for this.
                    scheduleManager.beginOperation(batchBeginMessage as ISequencedDocumentMessage);
                    scheduleManager.endOperation(undefined, batchBeginMessage as ISequencedDocumentMessage);

                    scheduleManager.beginOperation(batchEndMessage as ISequencedDocumentMessage);
                    scheduleManager.endOperation(undefined, batchEndMessage as ISequencedDocumentMessage);

                    // We should have only received one "batchBegin" and one "batchEnd" for the batch.
                    assert.strictEqual(1, batchBegin, "Did not receive correct batchBegin event for the batch");
                    assert.strictEqual(1, batchEnd, "Did not receive correct batchEnd event for the batch");
                });
            });
        });

        describe("getSnapshotForDataStores", () => {
            const emptyTree = (id: string): ISnapshotTree => ({
                id,
                blobs: {},
                commits: {},
                trees: {},
            });
            const testSnapshot: ISnapshotTree = {
                id: "root-id",
                blobs: {},
                commits: {},
                trees: {
                    [channelsTreeName]: {
                        id: "channels-id",
                        blobs: {},
                        commits: {},
                        trees: {
                            [nonDataStorePaths[0]]: emptyTree("lower-non-datastore-1"),
                            "some-datastore": emptyTree("lower-datastore-1"),
                            [nonDataStorePaths[1]]: emptyTree("lower-non-datastore-2"),
                            "another-datastore": emptyTree("lower-datastore-2"),
                        },
                    },
                    [nonDataStorePaths[0]]: emptyTree("top-non-datastore-1"),
                    "some-datastore": emptyTree("top-datastore-1"),
                    [nonDataStorePaths[1]]: emptyTree("top-non-datastore-2"),
                    "another-datastore": emptyTree("top-datastore-2"),
                },
            };

            it("Should return undefined for undefined snapshots", () => {
                let snapshot = getSnapshotForDataStores(undefined, undefined);
                assert(snapshot === undefined);
                snapshot = getSnapshotForDataStores(undefined, 1);
                assert(snapshot === undefined);
                snapshot = getSnapshotForDataStores(null as any, undefined);
                assert(snapshot === undefined);
                snapshot = getSnapshotForDataStores(null as any, 1);
                assert(snapshot === undefined);
            });

            it("Should strip out non-datastore paths for versions < 1", () => {
                const snapshot = getSnapshotForDataStores(testSnapshot, undefined);
                assert(snapshot, "Snapshot should be defined");
                assert.strictEqual(snapshot.id, "root-id", "Should be top-level");
                assert.strictEqual(Object.keys(snapshot.trees).length, 3, "Should have 3 datastores");
                assert.strictEqual(snapshot.trees[channelsTreeName]?.id, "channels-id",
                    "Should have channels tree as datastore");
                assert.strictEqual(snapshot.trees["some-datastore"]?.id, "top-datastore-1",
                    "Should have top datastore 1");
                assert.strictEqual(snapshot.trees["another-datastore"]?.id, "top-datastore-2",
                    "Should have top datastore 2");
            });

            it("Should give channels subtree for version 1", () => {
                const snapshot = getSnapshotForDataStores(testSnapshot, 1);
                assert(snapshot, "Snapshot should be defined");
                assert.strictEqual(snapshot.id, "channels-id", "Should be lower-level");
                assert.strictEqual(Object.keys(snapshot.trees).length, 4, "Should have 4 datastores");
                // Put in variable to avoid type-narrowing bug
                const nonDataStore1 = snapshot.trees[nonDataStorePaths[0]];
                assert.strictEqual(nonDataStore1?.id, "lower-non-datastore-1",
                    "Should have lower non-datastore 1");
                assert.strictEqual(snapshot.trees[nonDataStorePaths[1]]?.id, "lower-non-datastore-2",
                    "Should have lower non-datastore 2");
                assert.strictEqual(snapshot.trees["some-datastore"]?.id, "lower-datastore-1",
                    "Should have lower datastore 1");
                assert.strictEqual(snapshot.trees["another-datastore"]?.id, "lower-datastore-2",
                    "Should have lower datastore 2");
            });
        });
    });
});
