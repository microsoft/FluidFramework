/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { compress } from "lz4js";
import { ISequencedDocumentMessage } from "@fluidframework/protocol-definitions";
import { IsoBuffer } from "@fluid-internal/client-utils";
import type { IEnvelope } from "@fluidframework/runtime-definitions";
import { MockLogger } from "@fluidframework/telemetry-utils";
import { ContainerMessageType } from "../../index.js";
import { OpDecompressor } from "../../opLifecycle/index.js";
import type { InboundContainerRuntimeMessage } from "../../messageTypes.js";

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
		const result = decompressor.processMessage(generateCompressedBatchMessage(1));
		assert.equal(result.state, "Processed");
		assert.strictEqual((result.message.contents as ITestMessageContents).contents, "value0");
		assert.strictEqual(
			(result.message.metadata as { compressed?: unknown } | undefined)?.compressed,
			undefined,
		);
		assert.strictEqual(result.message.compression, undefined);
	});

	// Back-compat self healing mechanism for ADO:3538
	it("Processes single compressed op without compression markers", () => {
		const result = decompressor.processMessage({
			...generateCompressedBatchMessage(1),
			compression: undefined,
		});
		assert.equal(result.state, "Processed");
		assert.strictEqual((result.message.contents as ITestMessageContents).contents, "value0");
		assert.strictEqual(
			(result.message.metadata as { compressed?: unknown } | undefined)?.compressed,
			undefined,
		);
		assert.strictEqual(result.message.compression, undefined);

		mockLogger.assertMatch([
			{
				eventName: "OpDecompressor:LegacyCompression",
				category: "generic",
			},
		]);
	});

	it("Expecting only lz4 compression", () => {
		assert.throws(() =>
			decompressor.processMessage({
				...generateCompressedBatchMessage(5),
				compression: "gzip",
			}),
		);
	});

	it("Processes multiple compressed ops", () => {
		const rootMessage = generateCompressedBatchMessage(5);
		const firstMessageResult = decompressor.processMessage(rootMessage);

		assert.equal(firstMessageResult.state, "Accepted");
		assert.strictEqual(
			(firstMessageResult.message.contents as ITestMessageContents).contents,
			"value0",
		);
		assert.strictEqual(
			(firstMessageResult.message.metadata as { compressed?: unknown } | undefined)
				?.compressed,
			undefined,
		);
		assert.strictEqual(firstMessageResult.message.compression, undefined);

		for (let i = 1; i < 4; i++) {
			const result = decompressor.processMessage(emptyMessage);
			assert.equal(result.state, "Accepted");
			assert.strictEqual(
				(result.message.contents as ITestMessageContents).contents,
				`value${i}`,
			);
			assert.strictEqual(
				(result.message.metadata as { compressed?: unknown } | undefined)?.compressed,
				undefined,
			);
			assert.strictEqual(result.message.compression, undefined);
		}

		const lastMessageResult = decompressor.processMessage(endBatchEmptyMessage);
		assert.equal(lastMessageResult.state, "Processed");
		assert.strictEqual(
			(lastMessageResult.message.contents as ITestMessageContents).contents,
			"value4",
		);
		assert.strictEqual(
			(lastMessageResult.message.metadata as { compressed?: unknown } | undefined)
				?.compressed,
			undefined,
		);
		assert.strictEqual(lastMessageResult.message.compression, undefined);
	});

	it("Expecting empty messages in the middle of the compressed batch", () => {
		const rootMessage = generateCompressedBatchMessage(5);
		const firstMessageResult = decompressor.processMessage(rootMessage);

		assert.equal(firstMessageResult.state, "Accepted");
		assert.strictEqual(
			(firstMessageResult.message.contents as ITestMessageContents).contents,
			"value0",
		);

		assert.throws(() => decompressor.processMessage({ ...emptyMessage, contents: {} }));
	});

	it("Processes multiple batches of compressed ops", () => {
		const rootMessage = generateCompressedBatchMessage(5);
		const firstMessageResult = decompressor.processMessage(rootMessage);

		assert.equal(firstMessageResult.state, "Accepted");
		assert.strictEqual(
			(firstMessageResult.message.contents as ITestMessageContents).contents,
			"value0",
		);

		for (let i = 1; i < 4; i++) {
			const result = decompressor.processMessage(emptyMessage);
			assert.equal(result.state, "Accepted");
			assert.strictEqual(
				(result.message.contents as ITestMessageContents).contents,
				`value${i}`,
			);
		}

		const lastMessageResult = decompressor.processMessage(endBatchEmptyMessage);
		assert.equal(lastMessageResult.state, "Processed");
		assert.strictEqual(
			(lastMessageResult.message.contents as ITestMessageContents).contents,
			"value4",
		);

		const nextRootMessage = generateCompressedBatchMessage(3);
		const nextFirstMessageResult = decompressor.processMessage(nextRootMessage);
		assert.equal(nextFirstMessageResult.state, "Accepted");
		assert.strictEqual(
			(nextFirstMessageResult.message.contents as ITestMessageContents).contents,
			"value0",
		);

		const middleMessageResult = decompressor.processMessage(emptyMessage);
		assert.equal(middleMessageResult.state, "Accepted");
		assert.strictEqual(
			(middleMessageResult.message.contents as ITestMessageContents).contents,
			"value1",
		);

		const endBatchEmptyMessageResult = decompressor.processMessage(endBatchEmptyMessage);
		assert.equal(endBatchEmptyMessageResult.state, "Processed");
		assert.strictEqual(
			(endBatchEmptyMessageResult.message.contents as ITestMessageContents).contents,
			"value2",
		);
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
			const firstMessageResult = decompressor.processMessage(
				rootMessage as ISequencedDocumentMessage,
			);

			assert.equal(firstMessageResult.state, "Skipped");
			assert.deepStrictEqual(firstMessageResult.message, rootMessage);
		}
	});
});
