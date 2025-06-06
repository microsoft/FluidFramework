/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { type SequenceInterval } from "../intervals/index.js";

/**
 * Collection of intervals.
 *
 * Implementers of this interface will typically implement additional APIs to support efficiently querying a collection
 * of intervals in some manner, for example:
 * - "find all intervals with start endpoint between these two points"
 * - "find all intervals which overlap this range"
 * etc.
 * @legacy
 * @alpha
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
