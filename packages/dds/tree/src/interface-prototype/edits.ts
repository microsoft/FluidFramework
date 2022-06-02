/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * What to do when a Constraint is violated.
 * @public
 */
 export enum ConstraintEffect {
	/**
	 * Discard Edit.
	 */
	InvalidAndDiscard,

	/**
	 * Discard Edit, but record metadata that application may want to try and recover this change by recreating it.
	 * Should this be the default policy for when another (non Constraint) change is invalid?
	 */
	InvalidRetry,

	/**
	 * Apply the change, but flag it for possible reconsideration by the app
	 * (applying it is better than not, but perhaps the high level logic could produce something better).
	 */
	ValidRetry,

	/**
	 * Discard Edit,
     * but record metadata that application may want to try and
     * recover this change by recreating it if part of an offline merge.
	 */
	InvalidRetryOffline,

	/**
	 * Apply the change, but flag it for possible reconsideration by the app if part of an offline merge.
	 * (applying it is better than not, but perhaps the high level logic could produce something better).
	 */
	ValidRetryOffline,
}

// TODO: real Change type.
export class Change {
    protected makeNominal!: unknown;
}
