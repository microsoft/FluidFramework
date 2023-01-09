/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { ISequencedDocumentMessage, MessageType } from "@fluidframework/protocol-definitions";
import { IMessageProcessingResult, OpDecompressor, OpSplitter, RemoteMessageProcessor } from "../../opLifecycle";
import { ContainerMessageType } from "../..";

describe("RemoteMessageProcessor", () => {
    const stamp = (message: ISequencedDocumentMessage, value: string): ISequencedDocumentMessage => {
        const newMessage = { ...message };
        newMessage.metadata = message.metadata === undefined ? {} : message.metadata;
        newMessage.metadata.history = message.metadata.history === undefined ? [] : message.metadata.history;
        newMessage.metadata.history.push(value);
        return newMessage;
    };

    const getMockSplitter = (): Partial<OpSplitter> => ({
        processRemoteMessage(message: ISequencedDocumentMessage): IMessageProcessingResult {
            return {
                message: stamp(message, "reconstruct"),
                state: "Skipped",
            }
        },
    });

    const getMockDecompressor = (): Partial<OpDecompressor> => ({
        processMessage(message: ISequencedDocumentMessage): IMessageProcessingResult {
            return {
                message: stamp(message, "decompress"),
                state: "Skipped",
            }
        },
    });

    const getMessageProcessor = (
        mockSpliter: Partial<OpSplitter> = getMockSplitter(),
        mockDecompressor: Partial<OpDecompressor> = getMockDecompressor(),
    ): RemoteMessageProcessor =>
        new RemoteMessageProcessor(mockSpliter as OpSplitter, mockDecompressor as OpDecompressor);

    it("Always processing a shallow copy of the message", () => {
        const messageProcessor = getMessageProcessor();
        const contents = {
            contents: { key: "value" },
            type: ContainerMessageType.FluidDataStoreOp,
        };
        const message = {
            contents,
            clientId: "clientId",
            type: MessageType.Operation,
            metadata: { meta: "data" },
        };
        const documentMessage = message as ISequencedDocumentMessage;
        const result = messageProcessor.process(documentMessage);

        delete documentMessage.metadata;
        assert.ok(result.metadata);

        assert.strictEqual(result.contents, contents.contents);
        assert.strictEqual(result.type, contents.type);
    });

    it("Invokes internal processors in order", () => {
        const messageProcessor = getMessageProcessor();
        const message = {
            contents: {
                contents: {
                    key: "value"
                },
                type: ContainerMessageType.FluidDataStoreOp,
            },
            clientId: "clientId",
            type: MessageType.Operation,
            metadata: { meta: "data" },
        };
        const documentMessage = message as ISequencedDocumentMessage;
        const result = messageProcessor.process(documentMessage);

        assert.deepStrictEqual(result.metadata.history, ["decompress", "reconstruct"]);
        assert.deepStrictEqual(result.contents, message.contents.contents);
    });

    it("Invokes internal processors in order if the message is compressed and chunked", () => {
        let decompressCalls = 0;
        const messageProcessor = getMessageProcessor(
            {
                processRemoteMessage(original: ISequencedDocumentMessage): IMessageProcessingResult {
                    return {
                        message: stamp(original, "reconstruct"),
                        state: "Processed",
                    }
                },
            },
            {
                processMessage(original: ISequencedDocumentMessage): IMessageProcessingResult {
                    return {
                        message: stamp(original, "decompress"),
                        state: decompressCalls++ % 2 === 0 ? "Skipped" : "Processed",
                    }
                },
            }
        );

        const message = {
            contents: {
                contents: {
                    contents: {
                        key: "value"
                    }
                },
                type: ContainerMessageType.FluidDataStoreOp,
            },
            clientId: "clientId",
            type: MessageType.Operation,
            metadata: { meta: "data" },
        };
        const documentMessage = message as ISequencedDocumentMessage;
        const result = messageProcessor.process(documentMessage);

        assert.deepStrictEqual(result.metadata.history, ["decompress", "reconstruct", "decompress"]);
        assert.deepStrictEqual(result.contents, message.contents.contents.contents);
    });

    it("Processes legacy string-content message", () => {
        const messageProcessor = getMessageProcessor();
        const contents = {
            contents: { key: "value" },
            type: ContainerMessageType.FluidDataStoreOp,
        };
        const message = {
            contents: JSON.stringify(contents),
            clientId: "clientId",
            type: MessageType.Operation,
            metadata: { meta: "data" },
        };
        const documentMessage = message as ISequencedDocumentMessage;
        const result = messageProcessor.process(documentMessage);
        assert.deepStrictEqual(result.contents, contents.contents);
        assert.deepStrictEqual(result.type, contents.type);
    });

    it("Don't unpack non-datastore messages", () => {
        const messageProcessor = getMessageProcessor();
        const message = {
            contents: { key: "value" },
            clientId: "clientId",
            type: MessageType.Summarize,
            metadata: { meta: "data" },
        };
        const documentMessage = message as ISequencedDocumentMessage;
        const result = messageProcessor.process(documentMessage);
        assert.deepStrictEqual(result.contents, message.contents);
        assert.deepStrictEqual(result.type, message.type);
    });
});
