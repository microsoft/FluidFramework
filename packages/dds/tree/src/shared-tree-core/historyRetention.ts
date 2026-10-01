/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { UsageError } from "@fluidframework/telemetry-utils/internal";

/**
 * Persisted, per-instance history policy. An omitted setting means false, not a factory default.
 * @internal
 */
export type TreeHistoryConfiguration = Readonly<{ retainHistory?: boolean }>;

/**
 * Version 1 of the history-retention summary blob, present only on configured Trees.
 * The start is the first main-trunk sequence ID covered by the current retention epoch.
 * Earlier history can still be needed for collaboration, branches, or undo.
 */
export interface HistoryRetentionState {
	readonly version: 1;
	readonly start: {
		readonly revision: number;
		readonly sequenceNumber: number;
		readonly indexInBatch: number;
		// eslint-disable-next-line @rushstack/no-new-null -- Explicit absence in the JSON summary format.
	} | null;
}

export const historyRetentionBlobKey = "HistoryRetention";

/**
 * The unpublished sequence cursor must survive even when no trunk commits remain in the summary.
 */
export interface HistoryRetentionSummary extends HistoryRetentionState {
	// eslint-disable-next-line @rushstack/no-new-null -- Explicit absence in the JSON summary format.
	readonly detachedSequenceNumber: number | null;
	readonly minimumSequenceNumber: number;
}

/**
 * Validates persisted history metadata independently of optional codec validation.
 */
export function parseHistoryRetentionState(value: unknown): HistoryRetentionSummary {
	if (
		typeof value !== "object" ||
		value === null ||
		!("version" in value) ||
		value.version !== 1 ||
		!("start" in value) ||
		!("detachedSequenceNumber" in value) ||
		(value.detachedSequenceNumber !== null &&
			(typeof value.detachedSequenceNumber !== "number" ||
				!Number.isSafeInteger(value.detachedSequenceNumber) ||
				value.detachedSequenceNumber >= 0)) ||
		!("minimumSequenceNumber" in value) ||
		typeof value.minimumSequenceNumber !== "number" ||
		!Number.isSafeInteger(value.minimumSequenceNumber) ||
		Object.keys(value).length !== 4
	) {
		throw new UsageError("Unsupported SharedTree history retention state");
	}
	const { start } = value;
	if (start === null) {
		return {
			version: 1,
			start: null,
			detachedSequenceNumber: value.detachedSequenceNumber,
			minimumSequenceNumber: value.minimumSequenceNumber,
		};
	}
	if (
		typeof start !== "object" ||
		!("revision" in start) ||
		typeof start.revision !== "number" ||
		!Number.isSafeInteger(start.revision) ||
		start.revision < 0 ||
		!("sequenceNumber" in start) ||
		typeof start.sequenceNumber !== "number" ||
		!Number.isSafeInteger(start.sequenceNumber) ||
		start.sequenceNumber <= Number.MIN_SAFE_INTEGER ||
		!("indexInBatch" in start) ||
		typeof start.indexInBatch !== "number" ||
		!Number.isSafeInteger(start.indexInBatch) ||
		start.indexInBatch < 0 ||
		Object.keys(start).length !== 3
	) {
		throw new UsageError("Invalid SharedTree history retention boundary");
	}
	return {
		version: 1,
		detachedSequenceNumber: value.detachedSequenceNumber,
		minimumSequenceNumber: value.minimumSequenceNumber,
		start: {
			revision: start.revision,
			sequenceNumber: start.sequenceNumber,
			indexInBatch: start.indexInBatch,
		},
	};
}
