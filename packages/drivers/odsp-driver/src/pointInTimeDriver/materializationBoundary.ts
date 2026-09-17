/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ISequencedDocumentMessage } from "@fluidframework/driver-definitions/internal";

interface BatchMetadata {
	readonly batch?: boolean;
}

interface ChunkedContents {
	readonly chunkId: number;
	readonly totalChunks: number;
	readonly originalMetadata?: BatchMetadata;
}

function getChunkedContents(message: ISequencedDocumentMessage): ChunkedContents | undefined {
	let envelope: unknown = message.contents;
	if (typeof envelope === "string") {
		if (!envelope.includes("chunkedOp")) {
			return undefined;
		}
		envelope = JSON.parse(envelope) as unknown;
	}
	if (typeof envelope !== "object" || envelope === null) {
		return undefined;
	}

	const candidate =
		message.type === "chunkedOp"
			? envelope
			: (envelope as { readonly type?: unknown; readonly contents?: unknown }).type ===
					"chunkedOp"
				? (envelope as { readonly contents?: unknown }).contents
				: undefined;
	if (typeof candidate !== "object" || candidate === null) {
		return undefined;
	}

	const { chunkId, totalChunks, originalMetadata } = candidate as {
		readonly chunkId?: unknown;
		readonly totalChunks?: unknown;
		readonly originalMetadata?: unknown;
	};
	if (
		typeof chunkId !== "number" ||
		typeof totalChunks !== "number" ||
		!Number.isSafeInteger(chunkId) ||
		!Number.isSafeInteger(totalChunks) ||
		chunkId < 1 ||
		chunkId > totalChunks
	) {
		throw new Error("Invalid chunked operation metadata");
	}
	return {
		chunkId,
		totalChunks,
		originalMetadata: originalMetadata as BatchMetadata | undefined,
	};
}

/**
 * Tracks whether each raw sequenced message ends at a complete runtime materialization boundary.
 *
 * @internal
 */
export class MaterializationBoundaryTracker {
	private batchInProgress = false;
	private readonly nextChunkByClient = new Map<
		string | null,
		{ readonly nextChunkId: number; readonly totalChunks: number }
	>();
	private readonly completedChunkStreamClients = new Set<string | null>();

	public observe(message: ISequencedDocumentMessage): boolean {
		const chunkedContents = getChunkedContents(message);
		if (chunkedContents !== undefined) {
			const clientId = message.clientId;
			const expected = this.nextChunkByClient.get(clientId);
			const expectedChunkId =
				expected?.nextChunkId ??
				(this.completedChunkStreamClients.has(clientId) ? 1 : chunkedContents.chunkId);
			if (
				chunkedContents.chunkId !== expectedChunkId ||
				(expected !== undefined && chunkedContents.totalChunks !== expected.totalChunks)
			) {
				throw new Error("Non-contiguous chunked operation metadata");
			}
			if (chunkedContents.chunkId < chunkedContents.totalChunks) {
				this.nextChunkByClient.set(clientId, {
					nextChunkId: chunkedContents.chunkId + 1,
					totalChunks: chunkedContents.totalChunks,
				});
				return false;
			}
			this.nextChunkByClient.delete(clientId);
			this.completedChunkStreamClients.add(clientId);
			this.observeBatchMetadata(chunkedContents.originalMetadata);
			return this.isBoundary();
		}
		this.observeBatchMetadata(message.metadata as BatchMetadata | undefined);
		return this.isBoundary();
	}

	private observeBatchMetadata(metadata: BatchMetadata | undefined): void {
		if (metadata?.batch === true) {
			if (this.batchInProgress) {
				throw new Error("Nested runtime batch metadata");
			}
			this.batchInProgress = true;
			return;
		}
		if (metadata?.batch === false) {
			if (!this.batchInProgress) {
				throw new Error("Runtime batch ended without a start");
			}
			this.batchInProgress = false;
		}
	}

	private isBoundary(): boolean {
		return !this.batchInProgress;
	}
}
