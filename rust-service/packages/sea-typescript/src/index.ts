/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export { createMemoryService } from "./memory.js";
export { openWebTransport, type SeaWebTransportOptions } from "./webtransport.js";
export { openRemote, type SeaRemoteOptions } from "./websocket.js";
export {
	createSeaFactories,
	type SeaFactories,
	type SeaLoaderOptions,
	type SeaLoaderPreset,
} from "./presets.js";

/** Stable SEA failure categories, plus wrapper-local rejection after close.
 * @internal
 */
export type SeaErrorKind =
	| "InvalidPosition"
	| "StalePosition"
	| "Conflict"
	| "Rejected"
	| "Ambiguous"
	| "Unavailable"
	| "Corrupt"
	| "Closed";

/** Classified session or factory failure; artifact import/initialization can also throw platform errors.
 * @internal
 */
export interface SeaError extends Error {
	/** Backend classification, or Closed when the wrapper refuses a call after close. */
	readonly kind: SeaErrorKind;
}

/** Immutable content identity, not availability evidence or a WASM-owned object.
 * @internal
 */
export interface SeaTreeId {
	/** Content kind. */
	readonly kind: "blob" | "directory";
	/** Fixed-size content digest. */
	readonly bytes: Uint8Array;
}

/** Explicit author membership and decorator configuration.
 * @internal
 */
export interface SeaSessionOptions {
	/** Stable submission author. */
	readonly author: Uint8Array;
	/** Fresh membership identity. */
	readonly session: Uint8Array;
	/** Latest incorporated event. */
	readonly reference?: bigint;
	/** Enables compression only when the loaded bundle supports it. */
	readonly compression?: boolean;
}

/** One named child of an immutable directory.
 * @internal
 */
export interface SeaDirectoryEntry {
	/** Child name. */
	readonly name: string;
	/** Serializable child identity. */
	readonly child: SeaTreeId;
}

/** Selected or published snapshot.
 * @internal
 */
export interface SeaSnapshot {
	/** Snapshot result discriminant. */
	readonly kind: "snapshot";
	/** Included committed event. */
	readonly atEvent: bigint;
	/** Immutable snapshot root. */
	readonly root: SeaTreeId;
}

/** One committed opaque event.
 * @internal
 */
export interface SeaEvent {
	/** Event result discriminant. */
	readonly kind: "event";
	/** Service-authored membership transition or explicit application submission. */
	readonly eventType: "application" | "joined" | "left";
	/** Committed archive position. */
	readonly position: bigint;
	/** Decoded application payload. */
	readonly payload: Uint8Array;
	/** Referenced content, if present. */
	readonly blobTree?: SeaTreeId;
	/** Stable author identity. */
	readonly author: Uint8Array;
	/** Membership identity. */
	readonly session: Uint8Array;
	/** Latest event incorporated by this author. */
	readonly reference?: bigint;
	/** Minimum reference observed by the sequencer. */
	readonly minimumReference?: bigint;
}

/** Monitored history progress, separate from application events.
 * @internal
 */
export interface SeaProgress {
	/** Progress result discriminant. */
	readonly kind: "progress";
	/** Last delivered position. */
	readonly previous?: bigint;
	/** Latest known position. */
	readonly latestKnown?: bigint;
	/** Current delivery state. */
	readonly status: "StreamingBacklog" | "AwaitingNewItems" | "FallenBehind";
}

/** Closed history/load result cases.
 * @internal
 */
export type SeaLoadResult = SeaSnapshot | SeaEvent | SeaProgress;

/** Latest snapshot and optional publisher authority.
 * @internal
 */
export interface SeaSnapshotCoordination {
	/** Latest publication position. */
	readonly latest?: bigint;
	/** Current Sea-selected publisher fence. */
	readonly fence?: bigint;
}

/** Cancellation-owned stream; concurrent reads are rejected.
 * @internal
 */
export interface SeaStream<Item> {
	/** Reads one item or returns undefined at completion. */
	next(): Promise<Item | undefined>;
	/** Cancels pending reads and releases owned resources. */
	cancel(): void;
}

/** Non-Fluid-specific session operations with explicit membership lifetime.
 * @internal
 */
export interface SeaSignalMember {
	/** Document-scoped live connection identity. */
	readonly id: Uint8Array;
	/** Opaque public metadata. */
	readonly metadata: Uint8Array;
}

/** Requested delivery semantics; best effort permits reliable fallback.
 * @internal
 */
export type SeaSignalDelivery = "reliable" | "bestEffort";

/** Membership observations and opaque transient messages, without document positions.
 * @internal
 */
export type SeaSignalEvent =
	| { readonly kind: "members"; readonly members: readonly SeaSignalMember[] }
	| { readonly kind: "joined"; readonly member: SeaSignalMember }
	| { readonly kind: "left"; readonly id: Uint8Array }
	| {
			readonly kind: "message";
			readonly sender: Uint8Array;
			readonly target?: Uint8Array;
			readonly payload: Uint8Array;
			readonly delivery: SeaSignalDelivery;
	  };

/** Independent ephemeral messaging connection; no persistence, replay, or ordering with events.
 * @internal
 */
export interface SeaSignals {
	/** Sends to one current member, or broadcasts including self; completion means admission only. */
	send(
		payload: Uint8Array,
		options?: { readonly target?: Uint8Array; readonly delivery?: SeaSignalDelivery },
	): Promise<void>;
	/** Reads one live event; concurrent reads are rejected and close wakes a pending read. */
	next(): Promise<SeaSignalEvent | undefined>;
	/** Ends signal membership without closing archive access. */
	close(): Promise<void>;
}

/** Non-Fluid-specific session operations with explicit membership lifetime.
 * @internal
 */
export interface SeaSession {
	/** Opens independent document messaging; archive compression does not transform signal payloads. */
	openSignals(member: SeaSignalMember): Promise<SeaSignals>;
	/** Backend-assigned identity for reopening on the same service. */
	readonly document: Uint8Array;
	/**
	 * Announces immutable public member metadata, returning its ordered position.
	 * Exact retries are idempotent; changing metadata is rejected.
	 * Close, replacement, and service recovery append an ordered departure.
	 * Payload encryption and compression do not protect this control metadata.
	 */
	announceMembership(metadata: Uint8Array): Promise<bigint>;
	/** Uploads a blob through the selected stack. */
	putBlob(payload: Uint8Array): Promise<SeaTreeId>;
	/** Fetches and decodes a blob. */
	getBlob(id: SeaTreeId): Promise<Uint8Array>;
	/** Publishes a complete immutable directory. */
	putDirectory(entries: readonly SeaDirectoryEntry[]): Promise<SeaTreeId>;
	/** Reads named children of a directory. */
	getDirectory(id: SeaTreeId): Promise<readonly SeaDirectoryEntry[]>;
	/** Submits a new opaque event; equal inputs are distinct submissions. */
	submit(
		reference: bigint | undefined,
		payload: Uint8Array,
		blobTree?: SeaTreeId,
	): Promise<bigint>;
	/** Reads bounded or live monitored history. */
	read(after?: bigint, stopAfter?: bigint): SeaStream<SeaLoadResult>;
	/** Loads a snapshot and its gap-free suffix. */
	load(required?: bigint): Promise<SeaStream<SeaLoadResult>>;
	/** Returns the newest snapshot at or before an inclusive bound, or the latest if absent. */
	getSnapshot(required?: bigint): Promise<SeaSnapshot | undefined>;
	/** Registers explicit snapshot participation. */
	coordinateSnapshots(
		participation: "readOnly" | "seaSelected" | "clientSelected",
	): Promise<SeaStream<SeaSnapshotCoordination>>;
	/** Resolves dependencies and conditionally publishes a snapshot. */
	publishSnapshot(
		parent: bigint | undefined,
		fence: bigint | undefined,
		position: bigint,
		root: SeaTreeId,
	): Promise<SeaSnapshot>;
	/** Closes this membership, leaving other sessions and shared service storage intact. */
	close(): Promise<void>;
}

/** Independent memory namespace, shared only through this explicit object.
 * @internal
 */
export interface SeaMemoryService {
	/** Creates a document when its identity is undefined, otherwise opens it. */
	open(document: Uint8Array | undefined, options: SeaSessionOptions): Promise<SeaSession>;
	/** Releases service ownership; existing sessions retain their own resources. */
	close(): void;
}

/** Build artifact selection, independent of per-session compression settings.
 * @internal
 */
export interface SeaMemoryBundleOptions {
	/** Selects compiled capabilities without enabling decorators implicitly. */
	readonly configuration?: "memory" | "memory-compression";
	/** Browser fetch initialization or Node.js filesystem initialization. */
	readonly environment?: "browser" | "node";
}
