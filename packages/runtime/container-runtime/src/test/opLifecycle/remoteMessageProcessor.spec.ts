/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { generatePairwiseOptions } from "@fluid-private/test-pairwise-generator";
import type { IBatchMessage } from "@fluidframework/container-definitions/internal";
import {
	MessageType,
	ISequencedDocumentMessage,
} from "@fluidframework/driver-definitions/internal";
import { MockLogger } from "@fluidframework/telemetry-utils/internal";

import { ContainerMessageType } from "../../index.js";
import type { InboundSequencedContainerRuntimeMessage } from "../../messageTypes.js";
import {
	BatchManager,
	type BatchMessage,
	type BatchStartInfo,
	ensureContentsDeserialized,
	type IBatch,
	type InboundMessageResult,
	OpCompressor,
	OpDecompressor,
	OpGroupingManager,
	OpSplitter,
	RemoteMessageProcessor,
} from "../../opLifecycle/index.js";

describe("RemoteMessageProcessor", () => {
	function getMessageProcessor(): RemoteMessageProcessor {
		const logger = new MockLogger();
		return new RemoteMessageProcessor(
			new OpSplitter([], undefined, 1, 1, logger),
			new OpDecompressor(logger),
			new OpGroupingManager(
				{
					groupedBatchingEnabled: true,
					opCountThreshold: Infinity,
				},
				logger,
			),
		);
	}

	function getOutboundMessage(value: string, batchMetadata?: boolean): BatchMessage {
		return {
			metadata:
				batchMetadata === undefined
					? undefined
					: {
							batch: batchMetadata,
						},
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
		// chunking cannot happen without compression
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
		it(`Correctly processes single batch: compression [${option.compressionAndChunking.compression}] chunking [${option.compressionAndChunking.chunking}] grouping [${option.grouping}]`, () => {
			let batch: IBatch = {
				contentSizeInBytes: 1,
				referenceSequenceNumber: Infinity,
				messages: [
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
					},
					mockLogger,
				);
				batch = groupingManager.groupBatch(batch);
			}

			let leadingChunkCount = 0;
			const outboundMessages: IBatchMessage[] = [];
			if (option.compressionAndChunking.compression) {
				const compressor = new OpCompressor(mockLogger);
				batch = compressor.compressBatch(batch);

				if (option.compressionAndChunking.chunking) {
					const splitter = new OpSplitter(
						[],
						(messages: IBatchMessage[], refSeqNum?: number) => {
							++leadingChunkCount;
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
			outboundMessages.push(...batch.messages);

			const messageProcessor = getMessageProcessor();
			let batchStart: BatchStartInfo | undefined;
			const inboundMessages: InboundSequencedContainerRuntimeMessage[] = [];
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

				ensureContentsDeserialized(inboundMessage);
				const result = messageProcessor.process(inboundMessage, () => {});
				switch (result?.type) {
					case "fullBatch":
						assert(
							option.compressionAndChunking.chunking || outboundMessages.length === 1,
							"Apart from chunking, expected fullBatch for single-message batch only (includes Grouped Batches)",
						);
						batchStart = result.batchStart;
						inboundMessages.push(...result.messages);
						break;
					case "batchStartingMessage":
						batchStart = result.batchStart;
						inboundMessages.push(result.nextMessage);
						break;
					case "nextBatchMessage":
						assert(
							batchStart !== undefined,
							"batchStart should have been set from a prior message",
						);
						inboundMessages.push(result.nextMessage);
						break;
					default:
						// These are leading chunks
						assert(result === undefined, "unexpected result type");
						assert(
							option.compressionAndChunking.chunking,
							"undefined result only expected with chunking",
						);
						break;
				}
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

			assert.deepStrictEqual(inboundMessages, expected, "unexpected output");
			assert.equal(
				batchStart?.batchStartCsn,
				leadingChunkCount + 1,
				"unexpected batchStartCsn",
			);
		});
	});

	it("Processes multiple batches (No Grouped Batching)", () => {
		let csn = 1;

		// Use BatchManager.popBatch to get the right batch metadata included
		const batchManager = new BatchManager({
			canRebase: false,
			hardLimit: Number.MAX_VALUE,
		});
		batchManager.push({ contents: "A1", referenceSequenceNumber: 1 }, false /* reentrant */);
		batchManager.push({ contents: "A2", referenceSequenceNumber: 1 }, false /* reentrant */);
		batchManager.push({ contents: "A3", referenceSequenceNumber: 1 }, false /* reentrant */);
		const batchA = batchManager.popBatch();
		batchManager.push({ contents: "B1", referenceSequenceNumber: 1 }, false /* reentrant */);
		const batchB = batchManager.popBatch();
		batchManager.push({ contents: "C1", referenceSequenceNumber: 1 }, false /* reentrant */);
		batchManager.push({ contents: "C2", referenceSequenceNumber: 1 }, false /* reentrant */);
		const batchC = batchManager.popBatch("C" /* batchId */);
		batchManager.push({ contents: "D1", referenceSequenceNumber: 1 }, false /* reentrant */);
		const batchD = batchManager.popBatch("D" /* batchId */);

		const processor = getMessageProcessor();

		// Add clientId and CSN as would happen on final stage of submit
		const inboundMessages: ISequencedDocumentMessage[] = [
			...batchA.messages,
			...batchB.messages,
			...batchC.messages,
			...batchD.messages,
		].map((message) => ({
			...(message as ISequencedDocumentMessage),
			clientId: "CLIENT_ID",
			clientSequenceNumber: csn++,
		}));

		const processResults = inboundMessages.map((message) =>
			processor.process(message, () => {}),
		);

		// Expected results
		const messagesA = [
			{
				"contents": "A1",
				"referenceSequenceNumber": 1,
				"clientSequenceNumber": 1,
				"metadata": { "batch": true },
				"clientId": "CLIENT_ID",
			},
			{
				"contents": "A2",
				"referenceSequenceNumber": 1,
				"clientSequenceNumber": 2,
				"clientId": "CLIENT_ID",
			},
			{
				"contents": "A3",
				"referenceSequenceNumber": 1,
				"clientSequenceNumber": 3,
				"metadata": { "batch": false },
				"clientId": "CLIENT_ID",
			},
		];
		const messagesB = [
			{
				"contents": "B1",
				"referenceSequenceNumber": 1,
				"clientSequenceNumber": 4,
				"clientId": "CLIENT_ID",
			},
		];
		const messagesC = [
			{
				"contents": "C1",
				"referenceSequenceNumber": 1,
				"clientSequenceNumber": 5,
				"metadata": { "batch": true, "batchId": "C" },
				"clientId": "CLIENT_ID",
			},
			{
				"contents": "C2",
				"referenceSequenceNumber": 1,
				"clientSequenceNumber": 6,
				"metadata": { "batch": false },
				"clientId": "CLIENT_ID",
			},
		];
		const messagesD = [
			{
				"contents": "D1",
				"referenceSequenceNumber": 1,
				"clientSequenceNumber": 7,
				"metadata": { "batchId": "D" },
				"clientId": "CLIENT_ID",
			},
		];
		const expectedInfo: Partial<InboundMessageResult>[] = [
			// A
			{
				type: "batchStartingMessage",
				batchStart: {
					batchId: undefined,
					clientId: "CLIENT_ID",
					keyMessage: messagesA[0] as ISequencedDocumentMessage,
					batchStartCsn: 1,
				},
			},
			{ type: "nextBatchMessage", batchEnd: false },
			{ type: "nextBatchMessage", batchEnd: true },
			// B
			{
				type: "fullBatch",
				batchStart: {
					clientId: "CLIENT_ID",
					batchId: undefined,
					batchStartCsn: 4,
					keyMessage: messagesB[0] as ISequencedDocumentMessage,
				},
				groupedBatch: false,
				length: 1,
			},
			// C
			{
				type: "batchStartingMessage",
				batchStart: {
					batchId: "C",
					clientId: "CLIENT_ID",
					batchStartCsn: 5,
					keyMessage: messagesC[0] as ISequencedDocumentMessage,
				},
			},
			{ type: "nextBatchMessage", batchEnd: true },
			// D
			{
				type: "fullBatch",
				batchStart: {
					clientId: "CLIENT_ID",
					batchId: "D",
					batchStartCsn: 7,
					keyMessage: messagesD[0] as ISequencedDocumentMessage,
				},
				groupedBatch: false,
				length: 1,
			},
		];
		const expectedMessages = [...messagesA, ...messagesB, ...messagesC, ...messagesD];

		assert.deepStrictEqual(
			processResults.flatMap((result) =>
				result?.type === "fullBatch" ? [...result.messages] : [result?.nextMessage],
			),
			expectedMessages,
			"unexpected output from process",
		);

		// We checked messages in the previous assert, now clear them since they're not included in expectedInfo
		const clearMessages = (result: any) => {
			delete result.messages;
			delete result.nextMessage;
			return result as InboundMessageResult;
		};
		assert.deepStrictEqual(
			processResults.map(clearMessages),
			expectedInfo,
			"unexpected result info",
		);
	});

	describe("Throws on invalid batches", () => {
		it("Unexpected batch start marker mid-batch", () => {
			let csn = 1;
			const batchManager = new BatchManager({
				canRebase: false,
				hardLimit: Number.MAX_VALUE,
			});
			batchManager.push({ contents: "A1", referenceSequenceNumber: 1 }, false /* reentrant */);
			batchManager.push({ contents: "A2", referenceSequenceNumber: 1 }, false /* reentrant */);
			batchManager.push({ contents: "A3", referenceSequenceNumber: 1 }, false /* reentrant */);
			const batchA = batchManager.popBatch();
			batchA.messages[2].metadata = undefined; // Wipe out the ending metadata so the next batch's start shows up mid-batch
			batchManager.push({ contents: "B1", referenceSequenceNumber: 1 }, false /* reentrant */);
			batchManager.push({ contents: "B2", referenceSequenceNumber: 1 }, false /* reentrant */);
			const batchB = batchManager.popBatch();

			const processor = getMessageProcessor();

			// Add clientId and CSN as would happen on final stage of submit
			const inboundMessages: ISequencedDocumentMessage[] = [
				...batchA.messages,
				...batchB.messages,
			].map((message) => ({
				...(message as ISequencedDocumentMessage),
				clientId: "CLIENT_ID",
				clientSequenceNumber: csn++,
			}));

			assert.throws(
				() => {
					inboundMessages.map((message) => processor.process(message, () => {}));
				},
				(e: any) => {
					return e.message === "0x9d6";
				},
				"unexpected batch end marker should trigger assert",
			);
		});

		it("Unexpected batch end marker when no batch has started", () => {
			let csn = 1;
			const batchManager = new BatchManager({
				canRebase: false,
				hardLimit: Number.MAX_VALUE,
			});
			batchManager.push({ contents: "A1", referenceSequenceNumber: 1 }, false /* reentrant */);
			batchManager.push({ contents: "A2", referenceSequenceNumber: 1 }, false /* reentrant */);
			batchManager.push({ contents: "A3", referenceSequenceNumber: 1 }, false /* reentrant */);
			const batchA = batchManager.popBatch();
			batchA.messages[0].metadata = undefined; // Wipe out the starting metadata

			const processor = getMessageProcessor();

			// Add clientId and CSN as would happen on final stage of submit
			const inboundMessages: ISequencedDocumentMessage[] = [...batchA.messages].map(
				(message) => ({
					...(message as ISequencedDocumentMessage),
					clientId: "CLIENT_ID",
					clientSequenceNumber: csn++,
				}),
			);

			assert.throws(
				() => {
					inboundMessages.map((message) => processor.process(message, () => {}));
				},
				(e: any) => {
					return e.message === "0x9d5";
				},
				"unexpected batch start marker should trigger assert",
			);
		});
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
		ensureContentsDeserialized(documentMessage);
		const processResult = messageProcessor.process(documentMessage, () => {});

		assert.equal(
			processResult?.type,
			"fullBatch",
			"Single message should yield a 'fullBatch' result",
		);
		assert.strictEqual(processResult.length, 1, "only expected a single processed message");
		const [inboundMessage] = processResult.messages;

		assert.deepStrictEqual(inboundMessage.contents, contents.contents);
		assert.deepStrictEqual(inboundMessage.type, contents.type);
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
		const processResult = messageProcessor.process(documentMessage, () => {});

		assert.equal(
			processResult?.type,
			"fullBatch",
			"Single message should yield a 'fullBatch' result",
		);
		assert.strictEqual(processResult.length, 1, "only expected a single processed message");
		const [inboundMessage] = processResult.messages;

		assert.deepStrictEqual(inboundMessage.contents, message.contents);
		assert.deepStrictEqual(inboundMessage.type, message.type);
	});

	it("Processing groupedBatch works as expected", () => {
		const groupedBatch = {
			type: MessageType.Operation,
			sequenceNumber: 10,
			clientSequenceNumber: 12,
			clientId: "CLIENT_ID",
			metadata: {
				batchId: "BATCH_ID",
			},
			contents: {
				type: OpGroupingManager.groupedBatchOp,
				contents: [
					{
						metadata: { batch: true, batchId: "BATCH_ID" },
						contents: {
							type: ContainerMessageType.FluidDataStoreOp,
							contents: {
								contents: "a",
							},
						},
					},
					{
						metadata: { batch: false },
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
		const processResult = messageProcessor.process(
			groupedBatch as ISequencedDocumentMessage,
			() => {},
		);

		const expected = [
			{
				type: ContainerMessageType.FluidDataStoreOp,
				clientId: "CLIENT_ID",
				sequenceNumber: 10,
				clientSequenceNumber: 1,
				compression: undefined,
				metadata: { batch: true, batchId: "BATCH_ID" },
				contents: {
					contents: "a",
				},
			},
			{
				type: ContainerMessageType.FluidDataStoreOp,
				clientId: "CLIENT_ID",
				sequenceNumber: 10,
				clientSequenceNumber: 2,
				compression: undefined,
				metadata: { batch: false },
				contents: {
					contents: "b",
				},
			},
		];
		assert.deepStrictEqual(
			processResult,
			{
				type: "fullBatch",
				messages: expected,
				batchStart: {
					batchStartCsn: 12,
					clientId: "CLIENT_ID",
					batchId: "BATCH_ID",
					keyMessage: expected[0],
				},
				groupedBatch: true,
				length: 2,
			},
			"unexpected processing of groupedBatch",
		);
	});

	it("Processing empty groupedBatch works as expected", () => {
		const groupedBatch = {
			type: MessageType.Operation,
			sequenceNumber: 10,
			clientSequenceNumber: 8,
			clientId: "CLIENT_ID",
			metadata: {
				batchId: "BATCH_ID",
			},
			contents: {
				type: OpGroupingManager.groupedBatchOp,
				contents: [],
			},
		};
		const messageProcessor = getMessageProcessor();
		const processResult = messageProcessor.process(
			groupedBatch as ISequencedDocumentMessage,
			() => {},
		);
		assert.deepStrictEqual(
			processResult,
			{
				type: "fullBatch",
				messages: [],
				batchStart: {
					batchStartCsn: 8,
					clientId: "CLIENT_ID",
					batchId: "BATCH_ID",
					keyMessage: groupedBatch,
				},
				groupedBatch: true,
				length: 0,
			},
			"unexpected processing of empty groupedBatch",
		);
	});
});
