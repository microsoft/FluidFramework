/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { generatePairwiseOptions } from "@fluid-private/test-pairwise-generator";
import type { IBatchMessage } from "@fluidframework/container-definitions";
import { ISequencedDocumentMessage, MessageType } from "@fluidframework/protocol-definitions";
import { MockLogger } from "@fluidframework/telemetry-utils";
import { ContainerMessageType } from "../../index.js";
import {
	type BatchMessage,
	type IBatch,
	IMessageProcessingResult,
	OpCompressor,
	OpDecompressor,
	OpGroupingManager,
	OpSplitter,
	RemoteMessageProcessor,
} from "../../opLifecycle/index.js";

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

	function getOutboundMessage(value: string, batchMetadata?: boolean): BatchMessage {
		return {
			type: ContainerMessageType.FluidDataStoreOp,
			metadata:
				batchMetadata === undefined
					? undefined
					: {
							batch: batchMetadata,
					  },
			localOpMetadata: undefined,
			referenceSequenceNumber: Infinity,
			contents: JSON.stringify({
				contents: {
					key: value,
				},
				type: ContainerMessageType.FluidDataStoreOp,
			}),
		};
	}

	function getProcessedMessage(
		value: string,
		seqNum: number,
		clientSeqNum: number,
		batchMetadata?: boolean,
	): ISequencedDocumentMessage {
		// eslint-disable-next-line @typescript-eslint/consistent-type-assertions
		return {
			type: ContainerMessageType.FluidDataStoreOp,
			metadata:
				batchMetadata === undefined
					? undefined
					: {
							batch: batchMetadata,
					  },
			compression: undefined,
			sequenceNumber: seqNum,
			clientSequenceNumber: clientSeqNum,
			referenceSequenceNumber: Infinity,
			contents: {
				key: value,
			},
		} as ISequencedDocumentMessage;
	}

	const messageGenerationOptions = generatePairwiseOptions<{
		/** chunking cannot happen without compression */
		compressionAndChunking:
			| {
					compression: false;
					chunking: false;
			  }
			| {
					compression: true;
					chunking: boolean;
			  };
		grouping: boolean;
	}>({
		compressionAndChunking: [
			{ compression: false, chunking: false },
			{ compression: true, chunking: false },
			{ compression: true, chunking: true },
		],
		grouping: [true, false],
	});

	messageGenerationOptions.forEach((option) => {
		it(`Correctly processes incoming messages: compression [${option.compressionAndChunking.compression}] chunking [${option.compressionAndChunking.chunking}] grouping [${option.grouping}]`, () => {
			let batch: IBatch = {
				contentSizeInBytes: 1,
				referenceSequenceNumber: Infinity,
				content: [
					getOutboundMessage("a", true),
					getOutboundMessage("b"),
					getOutboundMessage("c"),
					getOutboundMessage("d"),
					getOutboundMessage("e", false),
				],
			};

			const mockLogger = new MockLogger();
			if (option.grouping) {
				const groupingManager = new OpGroupingManager(
					{
						groupedBatchingEnabled: true,
						opCountThreshold: 2,
						reentrantBatchGroupingEnabled: false,
					},
					mockLogger,
				);
				batch = groupingManager.groupBatch(batch);
			}

			const outboundMessages: IBatchMessage[] = [];
			if (option.compressionAndChunking.compression) {
				const compressor = new OpCompressor(mockLogger);
				batch = compressor.compressBatch(batch);

				if (option.compressionAndChunking.chunking) {
					const splitter = new OpSplitter(
						[],
						(messages: IBatchMessage[], refSeqNum?: number) => {
							outboundMessages.push(...messages);
							return 0;
						},
						2,
						Infinity,
						mockLogger,
					);
					batch = splitter.splitFirstBatchMessage(batch);
				}
			}
			let startSeqNum = outboundMessages.length + 1;
			outboundMessages.push(...batch.content);

			const messageProcessor = getMessageProcessor(
				new OpSplitter([], undefined, 1, 1, mockLogger),
				new OpDecompressor(mockLogger),
			);
			const actual: ISequencedDocumentMessage[] = [];
			let seqNum = 1;
			for (const message of outboundMessages) {
				// eslint-disable-next-line @typescript-eslint/consistent-type-assertions
				const inboundMessage = {
					type: MessageType.Operation,
					contents: message.contents,
					metadata: message.metadata,
					compression: message.compression,
					sequenceNumber: seqNum,
					clientSequenceNumber: seqNum++,
					referenceSequenceNumber: message.referenceSequenceNumber,
				} as ISequencedDocumentMessage;

				actual.push(...messageProcessor.process(inboundMessage));
			}

			const expected = option.grouping
				? [
						getProcessedMessage("a", startSeqNum, 1, true),
						getProcessedMessage("b", startSeqNum, 2),
						getProcessedMessage("c", startSeqNum, 3),
						getProcessedMessage("d", startSeqNum, 4),
						getProcessedMessage("e", startSeqNum, 5, false),
				  ]
				: [
						getProcessedMessage("a", startSeqNum, startSeqNum++, true),
						getProcessedMessage("b", startSeqNum, startSeqNum++),
						getProcessedMessage("c", startSeqNum, startSeqNum++),
						getProcessedMessage("d", startSeqNum, startSeqNum++),
						getProcessedMessage("e", startSeqNum, startSeqNum, false),
				  ];

			assert.deepStrictEqual(actual, expected, "unexpected output");
		});
	});

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
