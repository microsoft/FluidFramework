/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IBatchMessage } from "@fluidframework/container-definitions/internal";
import { ITelemetryBaseLogger } from "@fluidframework/core-interfaces";
import { assert } from "@fluidframework/core-utils/internal";
import { ISequencedDocumentMessage } from "@fluidframework/driver-definitions/internal";
import {
	DataCorruptionError,
	createChildLogger,
	extractSafePropertiesFromMessage,
	type ITelemetryLoggerExt,
} from "@fluidframework/telemetry-utils/internal";

// eslint-disable-next-line import/no-deprecated
import { ContainerMessageType, ContainerRuntimeChunkedOpMessage } from "../messageTypes.js";

import { estimateSocketSize } from "./batchManager.js";
import { BatchMessage, IBatch, IChunkedOp } from "./definitions.js";

export function isChunkedMessage(message: ISequencedDocumentMessage): boolean {
	return isChunkedContents(message.contents);
}

interface IChunkedContents {
	// eslint-disable-next-line import/no-deprecated
	readonly type: typeof ContainerMessageType.ChunkedOp;
	readonly contents: IChunkedOp;
}

function isChunkedContents(contents: unknown): contents is IChunkedContents {
	// eslint-disable-next-line import/no-deprecated
	return (contents as Partial<IChunkedContents>)?.type === ContainerMessageType.ChunkedOp;
}

/**
 * Responsible for creating and reconstructing chunked messages.
 */
export class OpSplitter {
	// Local copy of incomplete received chunks.
	private readonly chunkMap: Map<string, string[]>;
	private readonly logger: ITelemetryLoggerExt;

	constructor(
		chunks: [string, string[]][],
		private readonly submitBatchFn:
			| ((batch: IBatchMessage[], referenceSequenceNumber?: number) => number)
			| undefined,
		public readonly chunkSizeInBytes: number,
		private readonly maxBatchSizeInBytes: number,
		logger: ITelemetryBaseLogger,
	) {
		this.chunkMap = new Map<string, string[]>(chunks);
		this.logger = createChildLogger({ logger, namespace: "OpSplitter" });
	}

	public get isBatchChunkingEnabled(): boolean {
		return (
			this.chunkSizeInBytes < Number.POSITIVE_INFINITY && this.submitBatchFn !== undefined
		);
	}

	public get chunks(): ReadonlyMap<string, string[]> {
		return this.chunkMap;
	}

	public clearPartialChunks(clientId: string) {
		if (this.chunkMap.has(clientId)) {
			this.chunkMap.delete(clientId);
		}
	}

	private addChunk(
		clientId: string,
		chunkedContent: IChunkedOp,
		originalMessage: ISequencedDocumentMessage,
	) {
		let map = this.chunkMap.get(clientId);
		if (map === undefined) {
			map = [];
			this.chunkMap.set(clientId, map);
		}

		if (chunkedContent.chunkId !== map.length + 1) {
			// We are expecting the chunks to be processed sequentially, in the same order as they are sent.
			// Therefore, the chunkId of the incoming op needs to match the length of the array (1-based indexing)
			// holding the existing chunks for that particular clientId.
			throw new DataCorruptionError("Chunk Id mismatch", {
				...extractSafePropertiesFromMessage(originalMessage),
				chunkMapLength: map.length,
				chunkId: chunkedContent.chunkId,
				totalChunks: chunkedContent.totalChunks,
			});
		}

		map.push(chunkedContent.contents);
	}

	/**
	 * Splits the first op of a compressed batch in chunks, sends the chunks separately and
	 * returns a new batch composed of the last chunk and the rest of the ops in the original batch.
	 *
	 * A compressed batch is formed by one large op at the first position, followed by a series of placeholder ops
	 * which are used in order to reserve the sequence numbers for when the first op gets unrolled into the original
	 * uncompressed ops at ingestion in the runtime.
	 *
	 * If the first op is too large, it can be chunked (split into smaller op) which can be sent individually over the wire
	 * and accumulate at ingestion, until the last op in the chunk is processed, when the original op is unrolled.
	 *
	 * This method will send the first N - 1 chunks separately and use the last chunk as the first message in the result batch
	 * and then appends the original placeholder ops. This will ensure that the batch semantics of the original (non-compressed) batch
	 * are preserved, as the original chunked op will be unrolled by the runtime when the first message in the batch is processed
	 * (as it is the last chunk).
	 *
	 * To illustrate, if the input is `[largeOp, emptyOp, emptyOp]`, `largeOp` will be split into `[chunk1, chunk2, chunk3, chunk4]`.
	 * `chunk1`, `chunk2` and `chunk3` will be sent individually and `[chunk4, emptyOp, emptyOp]` will be returned.
	 *
	 * @remarks - A side effect here is that 1 or more chunks are queued immediately for sending in next JS turn.
	 *
	 * @param batch - the compressed batch which needs to be processed
	 * @returns A new adjusted batch (last chunk + empty placeholders) which can be sent over the wire
	 */
	public splitFirstBatchMessage(batch: IBatch): IBatch {
		assert(this.isBatchChunkingEnabled, 0x513 /* Chunking needs to be enabled */);
		assert(
			batch.contentSizeInBytes > 0 && batch.messages.length > 0,
			0x514 /* Batch needs to be non-empty */,
		);
		assert(
			batch.referenceSequenceNumber !== undefined,
			0x58a /* Batch must have a reference sequence number if non-empty */,
		);
		assert(this.chunkSizeInBytes !== 0, 0x515 /* Chunk size needs to be non-zero */);
		assert(
			this.chunkSizeInBytes < this.maxBatchSizeInBytes,
			0x516 /* Chunk size needs to be smaller than the max batch size */,
		);

		const firstMessage = batch.messages[0]; // we expect this to be the large compressed op, which needs to be split
		assert(
			(firstMessage.contents?.length ?? 0) >= this.chunkSizeInBytes,
			0x518 /* First message in the batch needs to be chunkable */,
		);

		const restOfMessages = batch.messages.slice(1); // we expect these to be empty ops, created to reserve sequence numbers
		const socketSize = estimateSocketSize(batch);
		const chunks = splitOp(
			firstMessage,
			this.chunkSizeInBytes,
			// If we estimate that the socket batch size will exceed the batch limit
			// we will inject an empty op to minimize the risk of the payload failing due to
			// the overhead from the trailing empty ops in the batch.
			socketSize >= this.maxBatchSizeInBytes,
		);

		assert(this.submitBatchFn !== undefined, 0x519 /* We don't support old loaders */);
		// Send the first N-1 chunks immediately
		for (const chunk of chunks.slice(0, -1)) {
			this.submitBatchFn(
				[chunkToBatchMessage(chunk, batch.referenceSequenceNumber)],
				batch.referenceSequenceNumber,
			);
		}

		// The last chunk will be part of the new batch and needs to
		// preserve the batch metadata of the original batch
		const lastChunk = chunkToBatchMessage(
			chunks[chunks.length - 1],
			batch.referenceSequenceNumber,
			{ batch: firstMessage.metadata?.batch },
		);

		this.logger.sendPerformanceEvent({
			// Used to be "Chunked compressed batch"
			eventName: "CompressedChunkedBatch",
			length: batch.messages.length,
			sizeInBytes: batch.contentSizeInBytes,
			chunks: chunks.length,
			chunkSizeInBytes: this.chunkSizeInBytes,
			socketSize,
		});

		return {
			messages: [lastChunk, ...restOfMessages],
			contentSizeInBytes: lastChunk.contents?.length ?? 0,
			referenceSequenceNumber: batch.referenceSequenceNumber,
		};
	}

	public processChunk(message: ISequencedDocumentMessage): ProcessChunkResult {
		assert(isChunkedContents(message.contents), 0x948 /* message not of type ChunkedOp */);
		const contents: IChunkedContents = message.contents;

		// TODO: Verify whether this should be able to handle server-generated ops (with null clientId)

		const clientId = message.clientId as string;
		const chunkedContent = contents.contents;
		this.addChunk(clientId, chunkedContent, message);

		if (chunkedContent.chunkId < chunkedContent.totalChunks) {
			// We are processing the op in chunks but haven't reached
			// the last chunk yet in order to reconstruct the original op
			return {
				isFinalChunk: false,
			};
		}

		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		const serializedContent = this.chunkMap.get(clientId)!.join("");
		this.clearPartialChunks(clientId);

		// The final/complete message will contain the data from all the chunks.
		// It will have the sequenceNumber of the last chunk
		const completeMessage = { ...message };
		completeMessage.contents =
			serializedContent === "" ? undefined : JSON.parse(serializedContent);
		// back-compat with 1.x builds
		// This is only required / present for non-compressed, chunked ops
		// For compressed ops, we have op grouping enabled, and type of each op is preserved within compressed content.
		// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment
		completeMessage.type = (chunkedContent as any).originalType;
		completeMessage.metadata = chunkedContent.originalMetadata;
		completeMessage.compression = chunkedContent.originalCompression;
		return {
			message: completeMessage,
			isFinalChunk: true,
		};
	}
}

type ProcessChunkResult =
	| {
			readonly isFinalChunk: false;
	  }
	| {
			readonly isFinalChunk: true;
			readonly message: ISequencedDocumentMessage;
	  };

const chunkToBatchMessage = (
	chunk: IChunkedOp,
	referenceSequenceNumber: number,
	metadata: Record<string, unknown> | undefined = undefined,
): BatchMessage => {
	const payload: ContainerRuntimeChunkedOpMessage = {
		// eslint-disable-next-line import/no-deprecated
		type: ContainerMessageType.ChunkedOp,
		contents: chunk,
	};
	return {
		contents: JSON.stringify(payload),
		metadata,
		referenceSequenceNumber,
	};
};

/**
 * Splits an op into smaller ops (chunks), based on the size of the op and the `chunkSizeInBytes` parameter.
 *
 * The last op of the result will be bundled with empty ops in the same batch. There is a risk of the batch payload
 * exceeding the 1MB limit due to the overhead from the empty ops. If the last op is large, the risk is even higher.
 * To minimize the odds, an extra empty op can be added to the result using the `extraOp` parameter.
 *
 * @param op - the op to be split
 * @param chunkSizeInBytes - how large should the chunks be
 * @param extraOp - should an extra empty op be added to the result
 * @returns an array of chunked ops
 */
export const splitOp = (
	op: BatchMessage,
	chunkSizeInBytes: number,
	extraOp: boolean = false,
): IChunkedOp[] => {
	const chunks: IChunkedOp[] = [];
	assert(
		op.contents !== undefined && op.contents !== null,
		0x51a /* We should have something to chunk */,
	);

	const contentLength = op.contents.length;
	const chunkCount =
		Math.floor((contentLength - 1) / chunkSizeInBytes) + 1 + (extraOp ? 1 : 0);
	let offset = 0;
	for (let chunkId = 1; chunkId <= chunkCount; chunkId++) {
		const chunk: IChunkedOp = {
			chunkId,
			contents: op.contents.substr(offset, chunkSizeInBytes),
			totalChunks: chunkCount,
		};

		if (chunkId === chunkCount) {
			// We don't need to port these to all the chunks,
			// as we rebuild the original op when we process the
			// last chunk, therefore it is the only one that needs it.
			chunk.originalMetadata = op.metadata;
			chunk.originalCompression = op.compression;

			// back-compat with 1.x builds
			// 2.x builds only do chunking for compressed ops.
			// originalType is no longer used in such cases, as each op preserves its type within compressed payload.
			// But, if 1.x builds see this op, and there is no type on the message, then it will ignore this message silently.
			// This is really bad, as we will crash on later ops and it's very hard to debug these cases.
			// If we put some known type here, then we will crash on it (as 1.x does not understand compression, and thus will not
			// find info on the op like address of the channel to deliver the op)
			// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
			(chunk as any).originalType = "component";
		}

		chunks.push(chunk);
		offset += chunkSizeInBytes;
		assert(
			chunkId >= chunkCount - 1 || offset <= contentLength,
			0x58b /* Content offset within bounds */,
		);
	}

	assert(
		offset >= contentLength,
		0x58c /* Content offset equal or larger than content length */,
	);
	assert(chunks.length === chunkCount, 0x5a5 /* Expected number of chunks */);
	return chunks;
};
