/** A service operation projected into the Fluid driver's sequenced-message model. */
export interface ProjectedOperation {
	/** Opaque service position that can resume projected reads and subscriptions. */
	readonly position: Uint8Array;
	/** Document-wide sequence number assigned by the service. */
	readonly sequenceNumber: bigint;
	/** Minimum service position still referenced by this operation, when present. */
	readonly minimumReference?: Uint8Array;
	/** Stable identity of the writer that submitted the operation. */
	readonly writer: Uint8Array;
	/** Writer session in which the operation was submitted. */
	readonly session: Uint8Array;
	/** Stable submission identity used for retry resolution. */
	readonly submission: Uint8Array;
	/** Writer-local sequence number carried by the submission. */
	readonly localSequenceNumber: bigint;
	/** Service position the submission referenced, or the initial position when absent. */
	readonly reference?: Uint8Array;
	/** Serialized Fluid document message. */
	readonly payload: Uint8Array;
}

/** A bounded page of projected operations and its continuation state. */
export interface ProjectedReadPage {
	/** Operations returned after the requested cursor. */
	readonly operations: readonly ProjectedOperation[];
	/** Opaque cursor to pass to the next read or subscription. */
	readonly cursor?: Uint8Array;
	/** Whether another page may contain additional operations. */
	readonly hasMore: boolean;
}

/** A cancellable, push-driven stream of projected operations. */
export interface ProjectedOperationSubscription {
	/** Waits for the next projected operation. */
	next(): Promise<ProjectedOperation>;
	/** Cancels the subscription and releases its transport resources. */
	cancel(): void | Promise<void>;
}

/** An ordered request/acknowledgement stream for submission frames. */
export interface SubmissionStream {
	/** Writes one complete FSP4 submission frame. */
	send(frame: Uint8Array): Promise<void>;
	/** Waits for the next acknowledgement in submission order. */
	next(): Promise<Uint8Array>;
	/** Closes the stream and releases its transport resources. */
	close(): void | Promise<void>;
}

/** The authoritative outcome of resolving a possibly ambiguous submission. */
export type SubmissionResolution =
	| {
			/** Indicates that the service found the submitted identity in its log. */
			readonly kind: "committed";
			/** Opaque committed position assigned to the submission. */
			readonly position: Uint8Array;
			/** Document-wide sequence number assigned to the submission. */
			readonly sequenceNumber: bigint;
	  }
	| {
			/** Distinguishes a safe-to-resubmit identity from an unresolved identity. */
			readonly kind: "notCommitted" | "stillUncertain";
	  };

/** Receipt returned after uploading an immutable content-addressed blob. */
export interface BlobUpload {
	/** Content digest used to fetch the blob. */
	readonly digest: Uint8Array;
	/** Uploaded payload size in bytes. */
	readonly sizeBytes: bigint;
	/** Whether the service already stored the same content. */
	readonly deduplicated: boolean;
}

/** One summary path mapped to an uploaded blob digest. */
export interface SummaryEntry {
	/** UTF-8 encoded path within the flattened summary tree. */
	readonly path: Uint8Array;
	/** Digest of the blob stored at the path. */
	readonly blob: Uint8Array;
}

/** Receipt returned after publishing a content-addressed summary manifest. */
export interface SummaryPublication {
	/** Digest used to fetch the published summary. */
	readonly digest: Uint8Array;
	/** Number of path-to-blob entries in the manifest. */
	readonly entryCount: number;
	/** Number of manifest bytes newly persisted by the service. */
	readonly persistedBytes: bigint;
	/** Whether an identical manifest was already stored. */
	readonly deduplicated: boolean;
}

/** Minimal generated-client surface consumed by the Fluid driver adapter. */
export interface WasmProtocolClient {
	/** Sends one unary FSP4 request and resolves with its complete response frame. */
	request(frame: Uint8Array): Promise<Uint8Array>;
	/** Opens an ordered submission stream when the generated client supports streaming. */
	openSubmissionStream?(document: Uint8Array): Promise<SubmissionStream>;
	/** Reads a bounded page of projected operations after an optional cursor. */
	readProjected(document: Uint8Array, after?: Uint8Array): Promise<ProjectedReadPage>;
	/** Subscribes to projected operations after an optional cursor. */
	subscribeProjected(
		document: Uint8Array,
		after?: Uint8Array,
	): ProjectedOperationSubscription | Promise<ProjectedOperationSubscription>;
	/** Resolves whether a stable submission identity committed after an ambiguous failure. */
	resolveSubmission(
		document: Uint8Array,
		writer: Uint8Array,
		session: Uint8Array,
		submission: Uint8Array,
	): Promise<SubmissionResolution>;
	/** Uploads an immutable blob and returns its content digest. */
	uploadBlob(payload: Uint8Array): Promise<BlobUpload>;
	/** Fetches an immutable blob by content digest. */
	fetchBlob(digest: Uint8Array): Promise<Uint8Array>;
	/** Publishes a flattened summary manifest. */
	publishSummary(entries: readonly SummaryEntry[]): Promise<SummaryPublication>;
	/** Fetches a flattened summary manifest by digest. */
	fetchSummary(digest: Uint8Array): Promise<readonly SummaryEntry[]>;
	/** Disconnects the current transport without implicit recovery. */
	disconnect(): void;
	/** Re-establishes transport access using adapter-specific arguments. */
	reconnect(...args: readonly unknown[]): void | Promise<void>;
	/** Total encoded bytes observed by clients that expose wire accounting. */
	readonly wireBytes: bigint;
	/** Largest unary response frame observed in bytes. */
	readonly peakResponseBytes: number;
	/** Largest projected-subscription frame observed in bytes. */
	readonly peakSubscriptionFrameBytes: number;
	/** Largest projected-subscription queue depth observed by the client. */
	readonly peakSubscriptionQueueDepth: number;
}
