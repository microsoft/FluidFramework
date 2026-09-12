export interface ProjectedOperation {
	readonly position: Uint8Array;
	readonly sequenceNumber: bigint;
	readonly minimumReference?: Uint8Array;
	readonly writer: Uint8Array;
	readonly session: Uint8Array;
	readonly submission: Uint8Array;
	readonly localSequenceNumber: bigint;
	readonly reference?: Uint8Array;
	readonly payload: Uint8Array;
}

export interface ProjectedReadPage {
	readonly operations: readonly ProjectedOperation[];
	readonly cursor?: Uint8Array;
	readonly hasMore: boolean;
}

export type SubmissionResolution =
	| {
			readonly kind: "committed";
			readonly position: Uint8Array;
			readonly sequenceNumber: bigint;
	  }
	| { readonly kind: "notCommitted" | "stillUncertain" };

export interface BlobUpload {
	readonly digest: Uint8Array;
	readonly sizeBytes: bigint;
	readonly deduplicated: boolean;
}

export interface SummaryEntry {
	readonly path: Uint8Array;
	readonly blob: Uint8Array;
}

export interface SummaryPublication {
	readonly digest: Uint8Array;
	readonly entryCount: number;
	readonly persistedBytes: bigint;
	readonly deduplicated: boolean;
}

export interface WasmProtocolClient {
	request(frame: Uint8Array): Promise<Uint8Array>;
	readProjected(document: Uint8Array, after?: Uint8Array): Promise<ProjectedReadPage>;
	resolveSubmission(
		document: Uint8Array,
		writer: Uint8Array,
		session: Uint8Array,
		submission: Uint8Array,
	): Promise<SubmissionResolution>;
	uploadBlob(payload: Uint8Array): Promise<BlobUpload>;
	fetchBlob(digest: Uint8Array): Promise<Uint8Array>;
	publishSummary(entries: readonly SummaryEntry[]): Promise<SummaryPublication>;
	fetchSummary(digest: Uint8Array): Promise<readonly SummaryEntry[]>;
	disconnect(): void;
	reconnect(...args: readonly unknown[]): void | Promise<void>;
	readonly wireBytes: bigint;
	readonly peakResponseBytes: number;
}
