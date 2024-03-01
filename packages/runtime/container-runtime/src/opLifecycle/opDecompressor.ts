/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { decompress } from "lz4js";
import { ISequencedDocumentMessage } from "@fluidframework/protocol-definitions";
import { assert } from "@fluidframework/core-utils";
import { IsoBuffer, Uint8ArrayToString } from "@fluid-internal/client-utils";
import { createChildLogger } from "@fluidframework/telemetry-utils";
import { ITelemetryBaseLogger } from "@fluidframework/core-interfaces";
import { CompressionAlgorithms } from "../containerRuntime.js";
import { IBatchMetadata } from "../metadata.js";
import { IMessageProcessingResult } from "./definitions.js";

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
	private rootMessageContents: any | undefined;
	private processedCount = 0;
	private readonly logger;

	constructor(logger: ITelemetryBaseLogger) {
		this.logger = createChildLogger({ logger, namespace: "OpDecompressor" });
	}

	public processMessage(message: ISequencedDocumentMessage): IMessageProcessingResult {
		assert(
			message.compression === undefined || message.compression === CompressionAlgorithms.lz4,
			0x511 /* Only lz4 compression is supported */,
		);

		if (
			(message.metadata as IBatchMetadata | undefined)?.batch === true &&
			this.isCompressed(message)
		) {
			// Beginning of a compressed batch
			assert(this.activeBatch === false, 0x4b8 /* shouldn't have multiple active batches */);
			this.activeBatch = true;

			const contents = IsoBuffer.from(
				(message.contents as IPackedContentsContents).packedContents,
				"base64",
			);
			const decompressedMessage = decompress(contents);
			const intoString = Uint8ArrayToString(decompressedMessage);
			const asObj = JSON.parse(intoString);
			this.rootMessageContents = asObj;

			return {
				message: newMessage(message, this.rootMessageContents[this.processedCount++]),
				state: "Accepted",
			};
		}

		if (
			this.rootMessageContents !== undefined &&
			(message.metadata as IBatchMetadata | undefined)?.batch === undefined &&
			this.activeBatch
		) {
			assert(message.contents === undefined, 0x512 /* Expecting empty message */);

			// Continuation of compressed batch
			return {
				message: newMessage(message, this.rootMessageContents[this.processedCount++]),
				state: "Accepted",
			};
		}

		if (
			this.rootMessageContents !== undefined &&
			(message.metadata as IBatchMetadata | undefined)?.batch === false
		) {
			// End of compressed batch
			const returnMessage = newMessage(
				message,
				this.rootMessageContents[this.processedCount++],
			);

			this.activeBatch = false;
			this.rootMessageContents = undefined;
			this.processedCount = 0;

			return {
				message: returnMessage,
				state: "Processed",
			};
		}

		if (
			(message.metadata as IBatchMetadata | undefined)?.batch === undefined &&
			this.isCompressed(message)
		) {
			// Single compressed message
			assert(
				this.activeBatch === false,
				0x4ba /* shouldn't receive compressed message in middle of a batch */,
			);

			const contents = IsoBuffer.from(
				(message.contents as IPackedContentsContents).packedContents,
				"base64",
			);
			const decompressedMessage = decompress(contents);
			const intoString = new TextDecoder().decode(decompressedMessage);
			const asObj = JSON.parse(intoString);

			return {
				message: newMessage(message, asObj[0]),
				state: "Processed",
			};
		}

		return {
			message,
			state: "Skipped",
		};
	}

	private isCompressed(message: ISequencedDocumentMessage) {
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
				).toString("base64") ===
					(message.contents as IPackedContentsContents).packedContents
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
}

// We should not be mutating the input message nor its metadata
const newMessage = (
	originalMessage: ISequencedDocumentMessage,
	contents: any,
): ISequencedDocumentMessage => ({
	...originalMessage,
	contents,
	compression: undefined,
	// TODO: It should already be the case that we're not modifying any metadata, not clear if/why this shallow clone should be required.
	// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
	metadata: { ...(originalMessage.metadata as any) },
});
