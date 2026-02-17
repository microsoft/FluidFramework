/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type {
	ISegment,
	LocalReferencePosition,
	PropertySet,
	ReferenceType,
	SlidingPreference,
} from "@fluidframework/merge-tree/internal";

import type { SequenceInterval } from "../intervals/index.js";

/**
 * Structural interface for creating local reference positions from a position number.
 * Both `Client` and `ISharedSegmentSequence` satisfy this interface structurally,
 * allowing index classes and transient interval creation to avoid depending on `Client` directly.
 *
 * @internal
 */
export interface IIntervalReferenceProvider {
	getContainingSegment(pos: number):
		| {
				segment: ISegment | undefined;
				offset: number | undefined;
		  }
		| undefined;
	createLocalReferencePosition(
		segment: ISegment | "start" | "end",
		offset: number | undefined,
		refType: ReferenceType,
		properties: PropertySet | undefined,
		slidingPreference?: SlidingPreference,
		canSlideToEndpoint?: boolean,
	): LocalReferencePosition;
}

/**
 * Collection of intervals.
 *
 * Implementers of this interface will typically implement additional APIs to support efficiently querying a collection
 * of intervals in some manner, for example:
 * - "find all intervals with start endpoint between these two points"
 * - "find all intervals which overlap this range"
 * etc.
 * @legacy @beta
 */
export interface SequenceIntervalIndex {
	/**
	 * Adds an interval to the index.
	 * @remarks Application code should never need to invoke this method on their index for production scenarios:
	 * Fluid handles adding and removing intervals from an index in response to sequence or interval changes.
	 */
	add(interval: SequenceInterval): void;

	/**
	 * Removes an interval from the index.
	 * @remarks Application code should never need to invoke this method on their index for production scenarios:
	 * Fluid handles adding and removing intervals from an index in response to sequence or interval changes.
	 */
	remove(interval: SequenceInterval): void;
}
