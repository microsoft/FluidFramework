/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Common controls for the Latest* Value Managers.
 *
 * @alpha
 */
export interface LatestValueControls {
	/**
	 * Maximum time in milliseconds that a local value update is allowed
	 * to remain pending before it must be broadcast.
	 *
	 * @remarks There is no guarantee of broadcast within time allowed
	 * as other conditions such as disconnect or service throttling may
	 * cause a delay.
	 */
	allowableUpdateLatency: number;
	/**
	 * Target time in milliseconds between oldest changed local state
	 * has been broadcast and forced rebroadcast of all local values.
	 * A value of less than 10 disables forced refresh.
	 *
	 * @defaultValue 0
	 */
	forcedRefreshInterval: number;
}
