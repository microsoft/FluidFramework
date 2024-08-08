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
import {
	BatchManager,
	type BatchMessage,
	ensureContentsDeserialized,
	type IBatch,
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
					reentrantBatchGroupingEnabled: false,
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
						reentrantBatchGroupingEnabled: false,
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
			const actual: ISequencedDocumentMessage[] = [];
			let seqNum = 1;
			let actualBatchStartCsn: number | undefined;
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

				ensureContentsDeserialized(inboundMessage, true, () => {});
				const processResult = messageProcessor.process(inboundMessage, () => {});

				// It'll be undefined for the first n-1 chunks if chunking is enabled
				if (processResult === undefined) {
					continue;
				}

				actual.push(...processResult.messages);

				if (actualBatchStartCsn === undefined) {
					actualBatchStartCsn = processResult.batchStartCsn;
				} else {
					assert(
						actualBatchStartCsn === processResult.batchStartCsn,
						"batchStartCsn shouldn't change while processing a single batch",
					);
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

			assert.deepStrictEqual(actual, expected, "unexpected output");
			assert.equal(actualBatchStartCsn, leadingChunkCount + 1, "unexpected batchStartCsn");
		});
	});

	it("Processes multiple batches", () => {
		let csn = 1;
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

		const expectedResults = [
			// A
			undefined,
			undefined,
			{
				messages: [
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
				],
				clientId: "CLIENT_ID",
				batchId: undefined,
				batchStartCsn: 1,
			},
			// B
			{
				messages: [
					{
						"contents": "B1",
						"referenceSequenceNumber": 1,
						"clientSequenceNumber": 4,
						"clientId": "CLIENT_ID",
					},
				],
				clientId: "CLIENT_ID",
				batchId: undefined,
				batchStartCsn: 4,
			},
			// C
			undefined,
			{
				messages: [
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
				],
				batchId: "C",
				clientId: "CLIENT_ID",
				batchStartCsn: 5,
			},
			// D
			{
				messages: [
					{
						"contents": "D1",
						"referenceSequenceNumber": 1,
						"clientSequenceNumber": 7,
						"metadata": { "batchId": "D" },
						"clientId": "CLIENT_ID",
					},
				],
				clientId: "CLIENT_ID",
				batchId: "D",
				batchStartCsn: 7,
			},
		];

		assert.deepStrictEqual(processResults, expectedResults, "unexpected output from process");
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
		ensureContentsDeserialized(documentMessage, true, () => {});
		const processResult = messageProcessor.process(documentMessage, () => {})?.messages ?? [];

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
		const processResult = messageProcessor.process(documentMessage, () => {})?.messages ?? [];

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
		const inboundBatch = messageProcessor.process(
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
			inboundBatch,
			{
				messages: expected,
				batchStartCsn: 12,
				clientId: "CLIENT_ID",
				batchId: "BATCH_ID",
				emptyBatchSequenceNumber: undefined,
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
				messages: [],
				batchStartCsn: 8,
				clientId: "CLIENT_ID",
				batchId: "BATCH_ID",
				emptyBatchSequenceNumber: 10,
			},
			"unexpected processing of empty groupedBatch",
		);
	});
});
