/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Common controls for States objects.
 *
 * @sealed
 * @beta
 */
export interface BroadcastControls {
	/**
	 * Maximum time in milliseconds that a local value update is allowed
	 * to remain pending before it must be broadcast.
	 *
	 * @remarks
	 * There is no guarantee of broadcast within time allowed
	 * as other conditions such as disconnect or service throttling may
	 * cause a delay.
	 *
	 * Setting to `undefined` will restore to a system default.
	 */
	allowableUpdateLatencyMs: number | undefined;

	/**
	 * Target time in milliseconds between oldest changed local state
	 * has been broadcast and forced rebroadcast of all local values.
	 * A value of less than 10 disables forced refresh.
	 *
	 * @privateRemarks
	 * Any time less than 10 milliseconds is likely to generate too
	 * many signals. Ideally this feature becomes obsolete as
	 * we understand the system better and account for holes.
	 */
	// forcedRefreshIntervalMs is removed until it is supported.
	// forcedRefreshIntervalMs: number | undefined;
}

/**
 * Value set to configure {@link BroadcastControls}.
 *
 * @beta
 */
export interface BroadcastControlSettings {
	/**
	 * {@inheritdoc BroadcastControls.allowableUpdateLatencyMs}
	 *
	 * @defaultValue 60 [milliseconds]
	 */
	readonly allowableUpdateLatencyMs?: number;

	/**
	 * {@inheritdoc BroadcastControls.forcedRefreshIntervalMs}
	 *
	 * @defaultValue 0 (disabled)
	 */
	// forcedRefreshIntervalMs is removed until it is supported.
	// readonly forcedRefreshIntervalMs?: number;
}
