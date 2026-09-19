/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type {
	SeaDirectoryEntry,
	SeaError,
	SeaErrorKind,
	SeaLoadResult,
	SeaMemoryService,
	SeaSession,
	SeaSnapshot,
	SeaTreeId,
} from "@fluidframework/sea-typescript/internal";

/** Tests exact type equality rather than one-way assignability. */
type Equal<Left, Right> =
	(<Value>() => Value extends Left ? 1 : 2) extends <Value>() => Value extends Right ? 1 : 2
		? true
		: false;
/** Fails compilation when a consumer-facing type assertion is false. */
type Assert<Value extends true> = Value;
/** Event variant after a consumer narrows the load-result discriminator. */
type EventResult = Extract<SeaLoadResult, { readonly kind: "event" }>;

/** Compile fixture proving event positions are required after load-result narrowing. */
export type EventPositionIsRequired = Assert<Equal<EventResult["position"], bigint>>;
/** Compile fixture proving event payloads are required after load-result narrowing. */
export type EventPayloadIsRequired = Assert<Equal<EventResult["payload"], Uint8Array>>;
/** Compile fixture proving directory reads return named neutral entries. */
export type DirectoryEntriesAreTyped = Assert<
	Equal<Awaited<ReturnType<SeaSession["getDirectory"]>>, readonly SeaDirectoryEntry[]>
>;
/** Compile fixture proving submissions return committed positions directly. */
export type SubmissionReturnsPosition = Assert<
	Equal<Awaited<ReturnType<SeaSession["submit"]>>, bigint>
>;
/** Compile fixture proving every snapshot includes a committed event position. */
export type SnapshotPositionIsRequired = Assert<Equal<SeaSnapshot["atEvent"], bigint>>;
/** Compile fixture proving opening returns a session with its assigned document identity. */
export type CreationReturnsDocument = Assert<
	Equal<Awaited<ReturnType<SeaMemoryService["open"]>>["document"], Uint8Array>
>;
/** Compile fixture proving tree identity kind uses a closed neutral union. */
export type TreeKindIsClosed = Assert<Equal<SeaTreeId["kind"], "blob" | "directory">>;
/** Compile fixture proving service errors preserve their closed category. */
export type ServiceErrorKindIsClosed = Assert<Equal<SeaError["kind"], SeaErrorKind>>;
