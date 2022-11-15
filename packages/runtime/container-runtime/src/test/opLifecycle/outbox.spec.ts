/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { IBatchMessage, IContainerContext, IDeltaManager } from "@fluidframework/container-definitions";
import { IDocumentMessage, ISequencedDocumentMessage, MessageType } from "@fluidframework/protocol-definitions";
import { IBatchProcessor, Outbox } from "../../opLifecycle";
import { BatchMessage, IBatch } from "../../batchManager";
import { PendingStateManager } from "../../pendingStateManager";
import {
    CompressionAlgorithms,
    ContainerMessageType,
    ContainerRuntimeMessage,
    ICompressionRuntimeOptions,
} from "../..";

describe("Outbox", () => {
    const maxBatchSizeInBytes = 1024;
    interface State {
        deltaManagerFlushCalls: number;
        canSendOps: boolean;
        batchesSubmitted: IBatchMessage[][];
        batchesCompressed: IBatch[];
        individualOpsSubmitted: any[];
        pendingOpContents: any[];
        opsSubmitted: number;
        pendingFlushCount: number;
    };
    const state: State = {
        deltaManagerFlushCalls: 0,
        canSendOps: true,
        batchesSubmitted: [],
        batchesCompressed: [],
        individualOpsSubmitted: [],
        pendingOpContents: [],
        opsSubmitted: 0,
        pendingFlushCount: 0,
    };

    const getMockDeltaManager = (): Partial<IDeltaManager<ISequencedDocumentMessage, IDocumentMessage>> => ({
        flush() {
            state.deltaManagerFlushCalls++;
        },
    });

    const getMockContext = (): Partial<IContainerContext> => ({
        deltaManager: getMockDeltaManager() as IDeltaManager<ISequencedDocumentMessage, IDocumentMessage>,
        clientDetails: { capabilities: { interactive: true } },
        updateDirtyContainerState: (_dirty: boolean) => { },
        submitFn: (type: MessageType, contents: any, batch: boolean, appData?: any) => {
            state.individualOpsSubmitted.push({ type, contents, batch, appData });
            state.opsSubmitted++;
            return state.opsSubmitted;
        },
        submitBatchFn: (batch: IBatchMessage[]): number => {
            state.batchesSubmitted.push(batch);
            state.opsSubmitted += batch.length;
            return state.opsSubmitted;
        },
    });

    const getMockLegacyContext = (): Partial<IContainerContext> => ({
        deltaManager: getMockDeltaManager() as IDeltaManager<ISequencedDocumentMessage, IDocumentMessage>,
        clientDetails: { capabilities: { interactive: true } },
        updateDirtyContainerState: (_dirty: boolean) => { },
        submitFn: (type: MessageType, contents: any, batch: boolean, appData?: any) => {
            state.individualOpsSubmitted.push({ type, contents, batch, appData });
            state.opsSubmitted++;
            return state.opsSubmitted;
        },
        connected: true,
    });

    const getMockCompressor = (): IBatchProcessor => ({
        processOutgoing: (batch: IBatch): IBatch => {
            state.batchesCompressed.push(batch);
            return batch;
        },
    });

    const getMockPendingStateManager = (): Partial<PendingStateManager> => ({
        onSubmitMessage: (
            type: ContainerMessageType,
            _clientSequenceNumber: number,
            referenceSequenceNumber: number,
            content: any,
            _localOpMetadata: unknown,
            opMetadata: Record<string, unknown> | undefined,
        ): void => {
            state.pendingOpContents.push({ type, content, referenceSequenceNumber, opMetadata });
        },
        onFlush: (): void => {
            state.pendingFlushCount++;
        },
    });

    const createMessage = (type: ContainerMessageType, contents: string): BatchMessage => {
        const deserializedContent: ContainerRuntimeMessage = { type, contents };
        return {
            contents: JSON.stringify(deserializedContent),
            deserializedContent,
            metadata: { "test": true },
            localOpMetadata: {},
            referenceSequenceNumber: Infinity,
        };
    };

    const batchedMessage = (message: BatchMessage, batchMarker: boolean | undefined = undefined) => {
        return batchMarker === undefined ?
            { contents: message.contents, metadata: message.metadata } :
            { contents: message.contents, metadata: { ...message.metadata, batch: batchMarker } };
    };

    const toBatch = (messages: BatchMessage[]): IBatch => ({
        content: messages,
        contentSizeInBytes: messages.map((message) => message.contents?.length ?? 0).reduce((a, b) => a + b, 0),
    });

    const getOutbox = (
        context: IContainerContext,
        maxBatchSize: number = maxBatchSizeInBytes,
        compressionOptions?: ICompressionRuntimeOptions,
    ) => new Outbox(
        () => state.canSendOps,
        getMockPendingStateManager() as PendingStateManager,
        context,
        {
            enableOpReentryCheck: false,
            maxBatchSizeInBytes: maxBatchSize,
            compressionOptions,
        },
        {
            compressor: getMockCompressor(),
        },
    );

    beforeEach(() => {
        state.deltaManagerFlushCalls = 0;
        state.canSendOps = true;
        state.batchesSubmitted.splice(0);
        state.batchesCompressed = [];
        state.individualOpsSubmitted.splice(0);
        state.pendingOpContents.splice(0);
        state.opsSubmitted = 0;
        state.pendingFlushCount = 0;
    });

    it("Sending batches", () => {
        const outbox = getOutbox(getMockContext() as IContainerContext);
        const messages = [
            createMessage(ContainerMessageType.FluidDataStoreOp, "0"),
            createMessage(ContainerMessageType.FluidDataStoreOp, "1"),
            createMessage(ContainerMessageType.Attach, "2"),
            createMessage(ContainerMessageType.Attach, "3"),
            createMessage(ContainerMessageType.FluidDataStoreOp, "4"),
            createMessage(ContainerMessageType.FluidDataStoreOp, "5"),
        ];

        outbox.submit(messages[0]);
        outbox.submit(messages[1]);
        outbox.submitAttach(messages[2]);
        outbox.submitAttach(messages[3]);

        outbox.flush();

        outbox.submit(messages[4]);
        outbox.flush();

        outbox.submit(messages[5]);

        assert.equal(state.opsSubmitted, messages.length - 1);
        assert.equal(state.individualOpsSubmitted.length, 0);
        assert.deepEqual(state.batchesSubmitted, [
            [
                batchedMessage(messages[2], true),
                batchedMessage(messages[3], false),
            ],
            [
                batchedMessage(messages[0], true),
                batchedMessage(messages[1], false),
            ],
            [
                batchedMessage(messages[4]),
            ], // The last message was not batched
        ]);
        assert.equal(state.deltaManagerFlushCalls, 0);
        const rawMessagesInFlushOrder = [
            messages[2], messages[3], messages[0], messages[1], messages[4],
        ];
        assert.equal(state.pendingFlushCount, 3);
        assert.deepEqual(state.pendingOpContents, rawMessagesInFlushOrder.map((message) => ({
            type: message.deserializedContent.type,
            content: message.deserializedContent.contents,
            referenceSequenceNumber: message.referenceSequenceNumber,
            opMetadata: message.metadata,
        })));
    });

    it("Will send messages only when allowed, but will store them in the pending state", () => {
        const outbox = getOutbox(getMockContext() as IContainerContext);
        const messages = [
            createMessage(ContainerMessageType.FluidDataStoreOp, "0"),
            createMessage(ContainerMessageType.FluidDataStoreOp, "1"),
        ];
        outbox.submit(messages[0]);
        outbox.flush();

        outbox.submit(messages[1]);
        state.canSendOps = false;
        outbox.flush();

        assert.equal(state.opsSubmitted, 1);
        assert.deepEqual(state.batchesSubmitted, [
            [
                batchedMessage(messages[0]),
            ],
        ]);
        assert.equal(state.pendingFlushCount, 2);
        assert.deepEqual(state.pendingOpContents, messages.map((message) => ({
            type: message.deserializedContent.type,
            content: message.deserializedContent.contents,
            referenceSequenceNumber: message.referenceSequenceNumber,
            opMetadata: message.metadata,
        })));
    });

    it("Uses legacy path for legacy contexts", () => {
        const outbox = getOutbox(getMockLegacyContext() as IContainerContext);
        const messages = [
            createMessage(ContainerMessageType.FluidDataStoreOp, "0"),
            createMessage(ContainerMessageType.FluidDataStoreOp, "1"),
            createMessage(ContainerMessageType.Attach, "2"),
            createMessage(ContainerMessageType.FluidDataStoreOp, "3"),
        ];

        outbox.submit(messages[0]);
        outbox.submit(messages[1]);
        outbox.submitAttach(messages[2]);
        outbox.submit(messages[3]);

        outbox.flush();

        assert.equal(state.opsSubmitted, messages.length);
        assert.equal(state.batchesSubmitted.length, 0);
        assert.deepEqual(state.individualOpsSubmitted.length, messages.length);
        assert.equal(state.deltaManagerFlushCalls, 2);
        const rawMessagesInFlushOrder = [
            messages[2], messages[0], messages[1], messages[3],
        ];
        assert.deepEqual(state.pendingOpContents, rawMessagesInFlushOrder.map((message) => ({
            type: message.deserializedContent.type,
            content: message.deserializedContent.contents,
            referenceSequenceNumber: message.referenceSequenceNumber,
            opMetadata: message.metadata,
        })));
    });

    it("Compress only if compression is enabled", () => {
        const outbox = getOutbox(
            getMockContext() as IContainerContext,
            /* maxBatchSize */ 1,
            {
                minimumBatchSizeInBytes: 1,
                compressionAlgorithm: CompressionAlgorithms.lz4,
            });

        const messages = [
            createMessage(ContainerMessageType.FluidDataStoreOp, "0"),
            createMessage(ContainerMessageType.FluidDataStoreOp, "1"),
            createMessage(ContainerMessageType.Attach, "2"),
            createMessage(ContainerMessageType.FluidDataStoreOp, "3"),
        ];

        outbox.submit(messages[0]);
        outbox.submit(messages[1]);
        outbox.submitAttach(messages[2]);
        outbox.submit(messages[3]);

        outbox.flush();

        assert.equal(state.opsSubmitted, messages.length);
        assert.equal(state.batchesSubmitted.length, 2);
        assert.equal(state.individualOpsSubmitted.length, 0);
        assert.equal(state.deltaManagerFlushCalls, 0);
        assert.deepEqual(state.batchesCompressed, [
            toBatch([messages[2]]),
            toBatch([messages[0], messages[1], messages[3]]),
        ]);
        assert.deepEqual(state.batchesSubmitted, [
            [
                batchedMessage(messages[2]),
            ],
            [
                batchedMessage(messages[0], true),
                batchedMessage(messages[1]),
                batchedMessage(messages[3], false),
            ],
        ]);

        const rawMessagesInFlushOrder = [
            messages[2], messages[0], messages[1], messages[3],
        ];
        assert.deepEqual(state.pendingOpContents, rawMessagesInFlushOrder.map((message) => ({
            type: message.deserializedContent.type,
            content: message.deserializedContent.contents,
            referenceSequenceNumber: message.referenceSequenceNumber,
            opMetadata: message.metadata,
        })));
    });

    it("Compress only if the batch is larger than the configured limit", () => {
        const outbox = getOutbox(
            getMockContext() as IContainerContext,
            /* maxBatchSize */ 1,
            {
                minimumBatchSizeInBytes: 1024,
                compressionAlgorithm: CompressionAlgorithms.lz4,
            });

        const messages = [
            createMessage(ContainerMessageType.FluidDataStoreOp, "0"),
            createMessage(ContainerMessageType.FluidDataStoreOp, "1"),
            createMessage(ContainerMessageType.Attach, "2"),
            createMessage(ContainerMessageType.FluidDataStoreOp, "3"),
        ];

        outbox.submit(messages[0]);
        outbox.submit(messages[1]);
        outbox.submitAttach(messages[2]);
        outbox.submit(messages[3]);

        outbox.flush();

        assert.equal(state.opsSubmitted, messages.length);
        assert.equal(state.batchesSubmitted.length, 2);
        assert.equal(state.individualOpsSubmitted.length, 0);
        assert.equal(state.deltaManagerFlushCalls, 0);
        assert.deepEqual(state.batchesCompressed, []);
        assert.deepEqual(state.batchesSubmitted, [
            [
                batchedMessage(messages[2]),
            ],
            [
                batchedMessage(messages[0], true),
                batchedMessage(messages[1]),
                batchedMessage(messages[3], false),
            ],
        ]);

        const rawMessagesInFlushOrder = [
            messages[2], messages[0], messages[1], messages[3],
        ];
        assert.deepEqual(state.pendingOpContents, rawMessagesInFlushOrder.map((message) => ({
            type: message.deserializedContent.type,
            content: message.deserializedContent.contents,
            referenceSequenceNumber: message.referenceSequenceNumber,
            opMetadata: message.metadata,
        })));
    });
});
