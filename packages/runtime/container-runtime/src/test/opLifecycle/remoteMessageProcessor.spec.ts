/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { ISequencedDocumentMessage, MessageType } from "@fluidframework/protocol-definitions";
import { MockLogger } from "@fluidframework/telemetry-utils";
import {
	IMessageProcessingResult,
	OpDecompressor,
	OpGroupingManager,
	OpSplitter,
	RemoteMessageProcessor,
} from "../../opLifecycle/index.js";
import { ContainerMessageType } from "../../index.js";

describe("RemoteMessageProcessor", () => {
	const stamp = (
		message: ISequencedDocumentMessage,
		value: string,
	): ISequencedDocumentMessage => {
		const newMessage = { ...message };
		newMessage.metadata = message.metadata === undefined ? {} : message.metadata;
		(newMessage.metadata as { history?: string[] }).history ??= [];
		(newMessage.metadata as { history: string[] }).history.push(value);
		return newMessage;
	};

	const getMockSplitter = (): Partial<OpSplitter> => ({
		processRemoteMessage(message: ISequencedDocumentMessage): IMessageProcessingResult {
			return {
				message: stamp(message, "reconstruct"),
				state: "Skipped",
			};
		},
	});

	const getMockDecompressor = (): Partial<OpDecompressor> => ({
		processMessage(message: ISequencedDocumentMessage): IMessageProcessingResult {
			return {
				message: stamp(message, "decompress"),
				state: "Skipped",
			};
		},
	});

	const getMessageProcessor = (
		mockSpliter: Partial<OpSplitter> = getMockSplitter(),
		mockDecompressor: Partial<OpDecompressor> = getMockDecompressor(),
	): RemoteMessageProcessor =>
		new RemoteMessageProcessor(
			mockSpliter as OpSplitter,
			mockDecompressor as OpDecompressor,
			new OpGroupingManager(
				{
					groupedBatchingEnabled: true,
					opCountThreshold: Infinity,
					reentrantBatchGroupingEnabled: false,
				},
				new MockLogger(),
			),
		);

	it("Invokes internal processors in order", () => {
		const messageProcessor = getMessageProcessor();
		const message = {
			contents: {
				contents: {
					key: "value",
				},
				type: ContainerMessageType.FluidDataStoreOp,
			},
			clientId: "clientId",
			type: MessageType.Operation,
			metadata: { meta: "data" },
		};
		const documentMessage = message as ISequencedDocumentMessage;
		const processResult = messageProcessor.process(documentMessage);

		assert.strictEqual(processResult.length, 1, "only expected a single processed message");
		const result = processResult[0];

		assert.deepStrictEqual((result.metadata as { history?: unknown }).history, [
			"decompress",
			"reconstruct",
		]);
		assert.deepStrictEqual(result.contents, message.contents.contents);
	});

	it("Invokes internal processors in order if the message is compressed and chunked", () => {
		let decompressCalls = 0;
		const messageProcessor = getMessageProcessor(
			{
				processRemoteMessage(
					original: ISequencedDocumentMessage,
				): IMessageProcessingResult {
					return {
						message: stamp(original, "reconstruct"),
						state: "Processed",
					};
				},
			},
			{
				processMessage(original: ISequencedDocumentMessage): IMessageProcessingResult {
					return {
						message: stamp(original, "decompress"),
						state: decompressCalls++ % 2 === 0 ? "Skipped" : "Processed",
					};
				},
			},
		);

		const message = {
			contents: {
				contents: {
					contents: {
						key: "value",
					},
				},
				type: ContainerMessageType.FluidDataStoreOp,
			},
			clientId: "clientId",
			type: MessageType.Operation,
			metadata: { meta: "data" },
		};
		const documentMessage = message as ISequencedDocumentMessage;
		const processResult = messageProcessor.process(documentMessage);

		assert.strictEqual(processResult.length, 1, "only expected a single processed message");
		const result = processResult[0];

		assert.deepStrictEqual((result.metadata as { history?: unknown }).history, [
			"decompress",
			"reconstruct",
			"decompress",
		]);
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
		const processResult = messageProcessor.process(documentMessage);

		assert.strictEqual(processResult.length, 1, "only expected a single processed message");
		const result = processResult[0];

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
		const processResult = messageProcessor.process(documentMessage);

		assert.strictEqual(processResult.length, 1, "only expected a single processed message");
		const result = processResult[0];

		assert.deepStrictEqual(result.contents, message.contents);
		assert.deepStrictEqual(result.type, message.type);
	});

	it("Processing groupedBatch works as expected", () => {
		const groupedBatch = {
			type: MessageType.Operation,
			sequenceNumber: 10,
			clientSequenceNumber: 12,
			contents: {
				type: OpGroupingManager.groupedBatchOp,
				contents: [
					{
						contents: {
							type: ContainerMessageType.FluidDataStoreOp,
							contents: {
								contents: "a",
							},
						},
					},
					{
						contents: {
							type: ContainerMessageType.FluidDataStoreOp,
							contents: {
								contents: "b",
							},
						},
					},
				],
			},
		};
		const messageProcessor = getMessageProcessor();
		const result = messageProcessor.process(groupedBatch as ISequencedDocumentMessage);

		const expected = [
			{
				type: ContainerMessageType.FluidDataStoreOp,
				sequenceNumber: 10,
				clientSequenceNumber: 1,
				compression: undefined,
				metadata: {
					history: ["decompress", "reconstruct"],
				},
				contents: {
					contents: "a",
				},
			},
			{
				type: ContainerMessageType.FluidDataStoreOp,
				sequenceNumber: 10,
				clientSequenceNumber: 2,
				compression: undefined,
				metadata: {
					history: ["decompress", "reconstruct"],
				},
				contents: {
					contents: "b",
				},
			},
		];
		assert.deepStrictEqual(result, expected, "unexpected processing of groupedBatch");
	});
});
