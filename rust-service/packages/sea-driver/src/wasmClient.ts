/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * A service operation projected into the Fluid driver's sequenced-message model.
 * @internal
 */
export interface ProjectedOperation {
	/** Present for neutral-session projection; summary acknowledgments are adapter-owned, not runtime attempts. */
	readonly eventType?: "application" | "joined" | "left" | "summaryAck";
	/** Membership mode retained from the announcement for departure projection. */
	readonly membershipMode?: "read" | "write";
	/** Minimum reference mapped into the same dense sequence space. */
	readonly minimumSequenceNumber?: bigint;
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

/**
 * A bounded page of projected operations and its continuation state.
 * @internal
 */
export interface ProjectedReadPage {
	/** Operations returned after the requested cursor. */
	readonly operations: readonly ProjectedOperation[];
	/** Opaque cursor to pass to the next read or subscription. */
	readonly cursor?: Uint8Array;
}

/**
 * A cancellable, push-driven stream of projected operations.
 * @internal
 */
export interface ProjectedOperationSubscription {
	/** Waits for the next projected operation. */
	next(): Promise<ProjectedOperation>;
	/** Cancels the subscription and releases its transport resources. */
	cancel(): void | Promise<void>;
	/** Optionally retrieves a batch of projected operations. */
	nextBatch?(maxOperations: number, maxBytes: number): Promise<readonly ProjectedOperation[]>;
}

/**
 * The authoritative outcome of resolving a possibly ambiguous submission.
 * @internal
 */
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
			/** Indicates absence, not permission to replay an untransformed payload. */
			readonly kind: "notCommitted";
	  };

/**
 * Receipt returned after uploading an immutable content-addressed blob.
 * @internal
 */
export interface BlobUpload {
	/** Content digest used to fetch the blob. */
	readonly digest: Uint8Array;
	/** Uploaded payload size in bytes. */
	readonly sizeBytes: bigint;
	/** Whether the service already stored the same content. */
	readonly deduplicated: boolean;
}

/**
 * One summary path mapped to an uploaded blob digest.
 * @internal
 */
export interface SummaryEntry {
	/** UTF-8 encoded path within the flattened summary tree. */
	readonly path: Uint8Array;
	/** Digest of the blob stored at the path. */
	readonly blob: Uint8Array;
}

/**
 * Receipt returned after publishing a content-addressed summary manifest.
 * @internal
 */
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

/**
 * Minimal generated-client surface consumed by the Fluid driver adapter.
 * @internal
 */
export interface SeaDriverClient {
	/** Opens independent live membership and reliable Fluid signal delivery. */
	openSignals?(
		member: import("@fluidframework/sea-typescript/internal").SeaSignalMember,
	): Promise<import("@fluidframework/sea-typescript/internal").SeaSignals>;
	/** Legacy clients reserve synthetic sequence slots; authoritative clients use zero. */
	readonly applicationSequenceOffset?: number;
	/** Publishes real membership when supported by the supplied session implementation. */
	announceMembership?(metadata: Uint8Array): Promise<void>;
	/** Creates a document and returns the backend-assigned identity used for later opens. */
	create(): Promise<Uint8Array>;
	/** Opens one archive-bound author session. */
	openSession(
		document: Uint8Array,
		writer: Uint8Array,
		session: Uint8Array,
		resumeAfter?: Uint8Array,
	): Promise<void>;
	/** Submits one opaque event and returns its canonical position. */
	submitEvent(
		submission: Uint8Array,
		localSequenceNumber: number,
		payload: Uint8Array,
		referencePosition?: Uint8Array,
	): Promise<Uint8Array>;
	/** Returns the latest snapshot publication and root. */
	latestSnapshot(): Promise<
		| {
				readonly id: Uint8Array;
				readonly root: Uint8Array;
				readonly atEvent?: Uint8Array;
		  }
		| undefined
	>;
	/** Returns one retained snapshot publication and root. */
	snapshot(id: Uint8Array): Promise<
		| {
				readonly id: Uint8Array;
				readonly root: Uint8Array;
				readonly atEvent?: Uint8Array;
		  }
		| undefined
	>;
	/** Conditionally publishes one directory root as a snapshot. */
	publishSnapshotRoot(
		expectedParent: Uint8Array | undefined,
		atEvent: Uint8Array | undefined,
		root: Uint8Array,
	): Promise<Uint8Array>;
	/** Resolves the Sea position mapped to one Fluid sequence number. */
	positionForSequence(sequenceNumber: number): Uint8Array | undefined;
	/** Reads a bounded page of projected operations after an optional cursor. */
	readProjected(after?: Uint8Array): Promise<ProjectedReadPage>;
	/** Subscribes to projected operations after an optional cursor. */
	subscribeProjected(
		after?: Uint8Array,
	): ProjectedOperationSubscription | Promise<ProjectedOperationSubscription>;
	/** Resolves whether a stable submission identity committed after an ambiguous failure. */
	resolveSubmission(submission: Uint8Array): Promise<SubmissionResolution>;
	/** Uploads an immutable blob and returns its content digest. */
	uploadBlob(payload: Uint8Array): Promise<BlobUpload>;
	/** Fetches an immutable blob by content digest. */
	fetchBlob(digest: Uint8Array): Promise<Uint8Array>;
	/** Publishes a flattened summary manifest. */
	publishSummary(entries: readonly SummaryEntry[]): Promise<SummaryPublication>;
	/** Fetches a flattened summary manifest by digest. */
	fetchSummary(digest: Uint8Array): Promise<readonly SummaryEntry[]>;
	/** Disconnects transport without implicit recovery; an optional owner cannot close a replacement. */
	disconnect(session?: Uint8Array): void;
	/** Re-establishes transport access using adapter-specific arguments. */
	reconnect(...args: readonly unknown[]): void | Promise<void>;
}
