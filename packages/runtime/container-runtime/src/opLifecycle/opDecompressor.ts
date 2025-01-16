/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IsoBuffer, Uint8ArrayToString } from "@fluid-internal/client-utils";
import { ITelemetryBaseLogger } from "@fluidframework/core-interfaces";
import { assert } from "@fluidframework/core-utils/internal";
import { ISequencedDocumentMessage } from "@fluidframework/driver-definitions/internal";
import { createChildLogger } from "@fluidframework/telemetry-utils/internal";
import { decompress } from "lz4js";

import { CompressionAlgorithms } from "../containerRuntime.js";
import { IBatchMetadata } from "../metadata.js";

/**
 * Compression makes assumptions about the shape of message contents. This interface codifies those assumptions, but does not validate them.
 */
interface IPackedContentsContents {
	packedContents: string;
}

/**
 * State machine that "unrolls" contents of compressed batches of ops after decompressing them.
 * This class relies on some implicit contracts defined below:
 * 1. A compressed batch will have its first message with batch metadata set to true and compressed set to true
 * 2. Messages in the middle of a compressed batch will have neither batch metadata nor the compression property set
 * 3. The final message of a batch will have batch metadata set to false
 * 4. An individually compressed op will have undefined batch metadata and compression set to true
 */
export class OpDecompressor {
	private activeBatch = false;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	private rootMessageContents: any | undefined;
	private processedCount = 0;
	private readonly logger;

	constructor(logger: ITelemetryBaseLogger) {
		this.logger = createChildLogger({ logger, namespace: "OpDecompressor" });
	}

	public isCompressedMessage(message: ISequencedDocumentMessage): boolean {
		if (message.compression === CompressionAlgorithms.lz4) {
			return true;
		}

		/**
		 * Back-compat self healing mechanism for ADO:3538, as loaders from
		 * version client_v2.0.0-internal.1.2.0 to client_v2.0.0-internal.2.2.0 do not
		 * support adding the proper compression metadata to compressed messages submitted
		 * by the runtime. Should be removed after the loader reaches sufficient saturation
		 * for a version greater or equal than client_v2.0.0-internal.2.2.0.
		 *
		 * The condition holds true for compressed messages, regardless of metadata. We are ultimately
		 * looking for a message with a single property `packedContents` inside `contents`, of type 'string'
		 * with a base64 encoded value.
		 */
		try {
			if (
				message.contents !== null &&
				typeof message.contents === "object" &&
				Object.keys(message.contents).length === 1 &&
				typeof (message.contents as { packedContents?: unknown }).packedContents ===
					"string" &&
				(message.contents as IPackedContentsContents).packedContents.length > 0 &&
				IsoBuffer.from(
					(message.contents as IPackedContentsContents).packedContents,
					"base64",
				).toString("base64") === (message.contents as IPackedContentsContents).packedContents
			) {
				this.logger.sendTelemetryEvent({
					eventName: "LegacyCompression",
					type: message.type,
					batch: (message.metadata as IBatchMetadata | undefined)?.batch,
				});
				return true;
			}
		} catch (err) {
			return false;
		}

		return false;
	}

	public get currentlyUnrolling() {
		return this.activeBatch;
	}

	/**
	 * Is the decompressed and stored batch only comprised of a single message
	 */
	private isSingleMessageBatch = false;

	/**
	 * Decompress the given compressed message and store it to be subsequently unrolled.
	 * The stored message will be of type `any[]` where each element represents a message's `contents`
	 */
	public decompressAndStore(message: ISequencedDocumentMessage): void {
		assert(
			message.compression === undefined || message.compression === CompressionAlgorithms.lz4,
			0x511 /* Only lz4 compression is supported */,
		);
		assert(
			this.isCompressedMessage(message),
			0x940 /* provided message should be compressed */,
		);

		assert(this.activeBatch === false, 0x4b8 /* shouldn't have multiple active batches */);
		this.activeBatch = true;

		const batchMetadata = (message.metadata as IBatchMetadata | undefined)?.batch;
		if (batchMetadata === undefined) {
			this.isSingleMessageBatch = true;
		} else {
			assert(batchMetadata === true, 0x941 /* invalid batch metadata */);
		}

		const contents = IsoBuffer.from(
			(message.contents as IPackedContentsContents).packedContents,
			"base64",
		);
		const decompressedMessage = decompress(contents);
		const intoString = Uint8ArrayToString(decompressedMessage);
		const asObj = JSON.parse(intoString);
		this.rootMessageContents = asObj;
	}

	/**
	 * Unroll the next message from the decompressed content provided to {@link decompressAndStore}
	 * @returns the unrolled `ISequencedDocumentMessage`
	 */
	public unroll(message: ISequencedDocumentMessage): ISequencedDocumentMessage {
		assert(this.currentlyUnrolling, 0x942 /* not currently unrolling */);
		assert(this.rootMessageContents !== undefined, 0x943 /* missing rootMessageContents */);
		assert(
			this.rootMessageContents.length > this.processedCount,
			0x944 /* no more content to unroll */,
		);

		const batchMetadata = (message.metadata as IBatchMetadata | undefined)?.batch;

		if (batchMetadata === false || this.isSingleMessageBatch) {
			// End of compressed batch
			const returnMessage = newMessage(message, this.rootMessageContents[this.processedCount]);

			this.activeBatch = false;
			this.isSingleMessageBatch = false;
			this.rootMessageContents = undefined;
			this.processedCount = 0;

			return returnMessage;
		} else if (batchMetadata === true) {
			// Start of compressed batch
			return newMessage(message, this.rootMessageContents[this.processedCount++]);
		}

		assert(batchMetadata === undefined, 0x945 /* invalid batch metadata */);
		assert(message.contents === undefined, 0x512 /* Expecting empty message */);

		// Continuation of compressed batch
		return newMessage(message, this.rootMessageContents[this.processedCount++]);
	}
}

// We should not be mutating the input message nor its metadata
const newMessage = (
	originalMessage: ISequencedDocumentMessage,
	contents: unknown,
): ISequencedDocumentMessage => ({
	...originalMessage,
	contents,
	compression: undefined,
	// TODO: It should already be the case that we're not modifying any metadata, not clear if/why this shallow clone should be required.

	metadata:
		originalMessage.metadata === undefined ? undefined : { ...originalMessage.metadata },
});
