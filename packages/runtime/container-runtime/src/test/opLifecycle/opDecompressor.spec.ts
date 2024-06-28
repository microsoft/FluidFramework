/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { IsoBuffer } from "@fluid-internal/client-utils";
import { ISequencedDocumentMessage } from "@fluidframework/driver-definitions/internal";
import type { IEnvelope } from "@fluidframework/runtime-definitions/internal";
import { MockLogger } from "@fluidframework/telemetry-utils/internal";
import { compress } from "lz4js";

import { ContainerMessageType } from "../../index.js";
import type { InboundContainerRuntimeMessage } from "../../messageTypes.js";
import { OpDecompressor } from "../../opLifecycle/index.js";

/**
 * Format of test messages generated in this test.
 */
interface ITestMessageContents {
	contents: string;
}

function generateCompressedBatchMessage(length: number): ISequencedDocumentMessage {
	const batch: InboundContainerRuntimeMessage[] = [];
	for (let i = 0; i < length; i++) {
		// Actual Op and contents aren't important. Values are not realistic.
		batch.push({
			type: ContainerMessageType.FluidDataStoreOp,
			contents: `value${i}` as unknown as IEnvelope,
		});
	}

	const contentsAsBuffer = new TextEncoder().encode(JSON.stringify(batch));
	const compressedContents = compress(contentsAsBuffer);
	const compressedContent = IsoBuffer.from(compressedContents).toString("base64");

	const messageBase: ISequencedDocumentMessage = {
		contents: { packedContents: compressedContent },
		metadata: { meta: "data" },
		clientId: "clientId",
		sequenceNumber: 1,
		minimumSequenceNumber: 1,
		clientSequenceNumber: 1,
		referenceSequenceNumber: 1,
		type: "type",
		timestamp: 1,
		compression: "lz4",
	};

	// Single compressed message won't have batch metadata
	if (length === 1) {
		return messageBase;
	}

	return {
		...messageBase,
		// TODO: It's not clear if this shallow clone is required, as opposed to just setting "batch" to false.
		// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
		metadata: { ...(messageBase.metadata as any), batch: true },
	};
}

const emptyMessage: ISequencedDocumentMessage = {
	contents: undefined,
	clientId: "clientId",
	sequenceNumber: 1,
	minimumSequenceNumber: 1,
	clientSequenceNumber: 1,
	referenceSequenceNumber: 1,
	type: "type",
	timestamp: 1,
};

const endBatchEmptyMessage: ISequencedDocumentMessage = {
	contents: {},
	metadata: { batch: false },
	clientId: "clientId",
	sequenceNumber: 1,
	minimumSequenceNumber: 1,
	clientSequenceNumber: 1,
	referenceSequenceNumber: 1,
	type: "type",
	timestamp: 1,
};

describe("OpDecompressor", () => {
	const mockLogger = new MockLogger();
	let decompressor: OpDecompressor;
	beforeEach(() => {
		mockLogger.clear();
		decompressor = new OpDecompressor(mockLogger);
	});

	it("Processes single compressed op", () => {
		const compressed = generateCompressedBatchMessage(1);
		decompressor.decompressAndStore(compressed);
		assert.equal(decompressor.currentlyUnrolling, true);
		const { message, batchStartCsn } = decompressor.unroll(compressed);
		assert.strictEqual((message.contents as ITestMessageContents).contents, "value0");
		assert.strictEqual(
			(message.metadata as { compressed?: unknown } | undefined)?.compressed,
			undefined,
		);
		assert.strictEqual(message.compression, undefined);
		assert.strictEqual(
			batchStartCsn,
			compressed.clientSequenceNumber,
			"batchStartCsn incorrect",
		);
	});

	// Back-compat self healing mechanism for ADO:3538
	it("Processes single compressed op without compression markers", () => {
		const compressed: ISequencedDocumentMessage = {
			...generateCompressedBatchMessage(1),
			compression: undefined,
		};
		decompressor.decompressAndStore(compressed);
		assert.equal(decompressor.currentlyUnrolling, true);
		const { message, batchStartCsn } = decompressor.unroll(compressed);

		assert.strictEqual((message.contents as ITestMessageContents).contents, "value0");
		assert.strictEqual(
			(message.metadata as { compressed?: unknown } | undefined)?.compressed,
			undefined,
		);
		assert.strictEqual(message.compression, undefined);
		assert.strictEqual(
			batchStartCsn,
			compressed.clientSequenceNumber,
			"batchStartCsn incorrect",
		);

		mockLogger.assertMatch([
			{
				eventName: "OpDecompressor:LegacyCompression",
				category: "generic",
			},
		]);
	});

	it("Expecting only lz4 compression", () => {
		assert.throws(() =>
			decompressor.decompressAndStore({
				...generateCompressedBatchMessage(5),
				compression: "gzip",
			}),
		);
	});

	it("Processes multiple compressed ops", () => {
		const rootMessage = generateCompressedBatchMessage(5);
		decompressor.decompressAndStore(rootMessage);
		assert.equal(decompressor.currentlyUnrolling, true);
		const { message: firstMessage, batchStartCsn: firstCsn } =
			decompressor.unroll(rootMessage);

		assert.strictEqual((firstMessage.contents as ITestMessageContents).contents, "value0");
		assert.strictEqual(
			(firstMessage.metadata as { compressed?: unknown } | undefined)?.compressed,
			undefined,
		);
		assert.strictEqual(firstMessage.compression, undefined);
		assert.strictEqual(firstCsn, rootMessage.clientSequenceNumber, "batchStartCsn incorrect");

		for (let i = 1; i < 4; i++) {
			assert.equal(decompressor.currentlyUnrolling, true);
			const { message, batchStartCsn } = decompressor.unroll(emptyMessage);
			assert.strictEqual((message.contents as ITestMessageContents).contents, `value${i}`);
			assert.strictEqual(
				(message.metadata as { compressed?: unknown } | undefined)?.compressed,
				undefined,
			);
			assert.strictEqual(message.compression, undefined);
			assert.strictEqual(
				batchStartCsn,
				rootMessage.clientSequenceNumber,
				"batchStartCsn incorrect",
			);
		}

		assert.equal(decompressor.currentlyUnrolling, true);
		const { message: lastMessage, batchStartCsn: lastCsn } =
			decompressor.unroll(endBatchEmptyMessage);
		assert.strictEqual((lastMessage.contents as ITestMessageContents).contents, "value4");
		assert.strictEqual(
			(lastMessage.metadata as { compressed?: unknown } | undefined)?.compressed,
			undefined,
		);
		assert.strictEqual(lastMessage.compression, undefined);
		assert.strictEqual(lastCsn, rootMessage.clientSequenceNumber, "batchStartCsn incorrect");
	});

	it("Expecting empty messages in the middle of the compressed batch", () => {
		const rootMessage = generateCompressedBatchMessage(5);
		decompressor.decompressAndStore(rootMessage);
		assert.equal(decompressor.currentlyUnrolling, true);
		const { message: firstMessage } = decompressor.unroll(rootMessage);

		assert.strictEqual((firstMessage.contents as ITestMessageContents).contents, "value0");

		assert.equal(decompressor.currentlyUnrolling, true);
		assert.throws(() => decompressor.unroll({ ...emptyMessage, contents: {} }));
	});

	it("Processes multiple batches of compressed ops", () => {
		const rootMessage = generateCompressedBatchMessage(5);
		decompressor.decompressAndStore(rootMessage);
		assert.equal(decompressor.currentlyUnrolling, true);
		const { message: firstMessage } = decompressor.unroll(rootMessage);

		assert.strictEqual((firstMessage.contents as ITestMessageContents).contents, "value0");

		for (let i = 1; i < 4; i++) {
			assert.equal(decompressor.currentlyUnrolling, true);
			const { message } = decompressor.unroll(emptyMessage);
			assert.strictEqual((message.contents as ITestMessageContents).contents, `value${i}`);
		}

		assert.equal(decompressor.currentlyUnrolling, true);
		const { message: lastMessage } = decompressor.unroll(endBatchEmptyMessage);
		assert.strictEqual((lastMessage.contents as ITestMessageContents).contents, "value4");

		const nextRootMessage = generateCompressedBatchMessage(3);
		decompressor.decompressAndStore(nextRootMessage);
		assert.equal(decompressor.currentlyUnrolling, true);
		const { message: nextFirstMessage } = decompressor.unroll(nextRootMessage);
		assert.strictEqual((nextFirstMessage.contents as ITestMessageContents).contents, "value0");

		assert.equal(decompressor.currentlyUnrolling, true);
		const { message: middleMessage } = decompressor.unroll(emptyMessage);
		assert.strictEqual((middleMessage.contents as ITestMessageContents).contents, "value1");

		assert.equal(decompressor.currentlyUnrolling, true);
		const { message: endBatchMessage } = decompressor.unroll(endBatchEmptyMessage);
		assert.strictEqual((endBatchMessage.contents as ITestMessageContents).contents, "value2");
	});

	it("Ignores ops without compression", () => {
		const rootMessages = [
			{
				// Back-compat self healing mechanism for ADO:3538,
				// the message should have a `packedContents` property.
				contents: { some: "contents" },
				metadata: { meta: "data" },
				clientId: "clientId",
				sequenceNumber: 1,
				term: 1,
				minimumSequenceNumber: 1,
				clientSequenceNumber: 1,
				referenceSequenceNumber: 1,
				type: "type",
				timestamp: 1,
			},
			{
				// Back-compat self healing mechanism for ADO:3538,
				contents: { packedContents: "packedContents is not base64 encoded" },
				metadata: { meta: "data" },
				clientId: "clientId",
				sequenceNumber: 1,
				term: 1,
				minimumSequenceNumber: 1,
				clientSequenceNumber: 1,
				referenceSequenceNumber: 1,
				type: "type",
				timestamp: 1,
			},
			{
				// Back-compat self healing mechanism for ADO:3538,
				contents: { packedContents: "YmFzZTY0IGNvbnRlbnQ=", some: "contents" },
				metadata: { meta: "data" },
				clientId: "clientId",
				sequenceNumber: 1,
				term: 1,
				minimumSequenceNumber: 1,
				clientSequenceNumber: 1,
				referenceSequenceNumber: 1,
				type: "type",
				timestamp: 1,
			},
			{
				metadata: { meta: "data" },
				clientId: "clientId",
				sequenceNumber: 1,
				term: 1,
				minimumSequenceNumber: 1,
				clientSequenceNumber: 1,
				referenceSequenceNumber: 1,
				type: "type",
				timestamp: 1,
			},
		];

		for (const rootMessage of rootMessages) {
			assert.equal(
				decompressor.isCompressedMessage(rootMessage as ISequencedDocumentMessage),
				false,
			);
		}
	});
});
