/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as assert from "assert";
import { EventEmitter } from "events";
import { DebugLogger } from "@microsoft/fluid-common-utils";
import { BlobTreeEntry, TreeTreeEntry } from "@microsoft/fluid-protocol-base";
import {
    ISummaryBlob,
    ISummaryHandle,
    ISummaryTree,
    ITree,
    SummaryObject,
    SummaryType,
    IDocumentMessage,
    ISequencedDocumentMessage,
    MessageType,
} from "@microsoft/fluid-protocol-definitions";
import { IDeltaManager } from "@microsoft/fluid-container-definitions";
import { MockDeltaManager } from "@microsoft/fluid-test-runtime-utils";
import {
    IConvertedSummaryResults,
    SummaryTreeConverter,
} from "../summaryTreeConverter";
import { ScheduleManager } from "../containerRuntime";

describe("Runtime", () => {
    describe("Container Runtime", () => {
        describe("Utils", () => {
            function assertSummaryTree(obj: SummaryObject): ISummaryTree {
                if (obj && obj.type === SummaryType.Tree) {
                    return obj;
                } else {
                    assert.fail("Object should be summary tree");
                }
            }
            function assertSummaryBlob(obj: SummaryObject): ISummaryBlob {
                if (obj && obj.type === SummaryType.Blob) {
                    return obj;
                } else {
                    assert.fail("Object should be summary blob");
                }
            }
            function assertSummaryHandle(obj: SummaryObject): ISummaryHandle {
                if (obj && obj.type === SummaryType.Handle) {
                    return obj;
                } else {
                    assert.fail("Object should be summary handle");
                }
            }

            describe("Convert to Summary Tree", () => {
                let summaryResults: IConvertedSummaryResults;
                let bufferLength: number;
                let converter: SummaryTreeConverter;

                before(() => {
                    converter = new SummaryTreeConverter();
                });

                beforeEach(() => {
                    const base64Content = Buffer.from("test-b64").toString("base64");
                    bufferLength = Buffer.from(base64Content, "base64").byteLength;
                    const inputTree: ITree = {
                        id: null,
                        entries: [
                            new TreeTreeEntry("t", {
                                id: null,
                                entries: [
                                    new BlobTreeEntry("bu8", "test-u8"),
                                    new BlobTreeEntry("b64", base64Content, "base64"),
                                ],
                            }),
                            new BlobTreeEntry("b", "test-blob"),
                            new TreeTreeEntry("h", { id: "test-handle", entries: [
                                new BlobTreeEntry("ignore", "this-should-be-ignored"),
                            ] }),
                        ],
                    };
                    summaryResults = converter.convertToSummaryTree(inputTree);
                });

                it("Should convert correctly", () => {
                    const summaryTree = assertSummaryTree(summaryResults.summaryTree);

                    // blobs should parse
                    const blob = assertSummaryBlob(summaryTree.tree.b);
                    assert.strictEqual(blob.content, "test-blob");

                    // trees with ids should become handles
                    const handle = assertSummaryHandle(summaryTree.tree.h);
                    assert.strictEqual(handle.handleType, SummaryType.Tree);
                    assert.strictEqual(handle.handle, "test-handle");

                    // subtrees should recurse
                    const subTree = assertSummaryTree(summaryTree.tree.t);
                    const subBlobUtf8 = assertSummaryBlob(subTree.tree.bu8);
                    assert.strictEqual(subBlobUtf8.content, "test-u8");
                    const subBlobBase64 = assertSummaryBlob(subTree.tree.b64);
                    assert.strictEqual(subBlobBase64.content.toString("utf-8"), "test-b64");
                });

                it("Should calculate summary data correctly", () => {
                    // nodes should count
                    assert.strictEqual(summaryResults.summaryStats.blobNodeCount, 3);
                    assert.strictEqual(summaryResults.summaryStats.handleNodeCount, 1);
                    assert.strictEqual(summaryResults.summaryStats.treeNodeCount, 2);
                    assert.strictEqual(summaryResults.summaryStats.totalBlobSize,
                        bufferLength + Buffer.byteLength("test-blob") + Buffer.byteLength("test-u8"));
                });
            });
        });

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

                it("Message with non batch-related metdata", () => {
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

                it("Partial batch messages followed by non batch-related metdata message from another client", () => {
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
                        metadata: { foo: 1},
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
    });
});
