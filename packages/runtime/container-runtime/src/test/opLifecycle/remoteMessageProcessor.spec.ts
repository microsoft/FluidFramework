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
	type BatchMessage,
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
		it(`Correctly processes incoming messages: compression [${option.compressionAndChunking.compression}] chunking [${option.compressionAndChunking.chunking}] grouping [${option.grouping}]`, () => {
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
			let emptyProcessResultCount = 0;
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

				const processResult = messageProcessor.process(inboundMessage);

				// It'll be undefined for the first n-1 chunks if chunking is enabled
				if (processResult === undefined) {
					++emptyProcessResultCount;
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
			assert.equal(
				emptyProcessResultCount,
				leadingChunkCount,
				"expected empty result to be 1-1 with leading chunks",
			);

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
		const processResult = messageProcessor.process(documentMessage)?.messages ?? [];

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
		const processResult = messageProcessor.process(documentMessage)?.messages ?? [];

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
				metadata: undefined,
				contents: {
					contents: "a",
				},
			},
			{
				type: ContainerMessageType.FluidDataStoreOp,
				sequenceNumber: 10,
				clientSequenceNumber: 2,
				compression: undefined,
				metadata: undefined,
				contents: {
					contents: "b",
				},
			},
		];
		assert.deepStrictEqual(
			result,
			{ messages: expected, batchStartCsn: 12 },
			"unexpected processing of groupedBatch",
		);
	});
});
