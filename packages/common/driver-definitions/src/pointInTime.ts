/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Why a requested sequence number cannot currently be materialized.
 *
 * @legacy @beta
 */
export type SequenceNumberAvailabilityReason =
	/** No retained snapshot on the current document lineage exists at or before the target. */
	| "noRetainedBase"
	/** One or more operations required to replay from the retained base are authoritatively absent. */
	| "missingBridgingOps"
	/** The target is inside an atomic runtime batch or an incomplete chunked operation. */
	| "notMaterializationBoundary";

/**
 * The observed point-in-time materialization status of a sequence number.
 *
 * @remarks
 * This result is intended for garbage-collecting already-resolved version marks. A result with
 * `status: "unavailable"` means the mark can be changed to an unresolvable state. A result with
 * `status: "unknown"` is not deletion authorization: the mark must remain resolved and may be
 * checked again later.
 *
 * Availability is an observation at query time. A sequence number reported as `available` may
 * become unavailable later if the service prunes its retained snapshot or operation history.
 *
 * @legacy @beta
 */
export type SequenceNumberAvailability =
	| {
			/** The sequence number that was checked. */
			readonly sequenceNumber: number;
			/** The complete point-in-time state was verified as materializable. */
			readonly status: "available";
	  }
	| {
			/** The sequence number that was checked. */
			readonly sequenceNumber: number;
			/** The point-in-time state was authoritatively proven not materializable. */
			readonly status: "unavailable";
			/** The authoritative reason the state cannot be materialized. */
			readonly reason: SequenceNumberAvailabilityReason;
	  }
	| {
			/** The sequence number that was checked. */
			readonly sequenceNumber: number;
			/** A transient condition prevented a conclusive answer. */
			readonly status: "unknown";
			/** Indicates that the check can be retried later. */
			readonly reason: "transientFailure";
	  };
