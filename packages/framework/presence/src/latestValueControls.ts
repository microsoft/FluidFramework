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
	 *
	 * @privateRemarks
	 * Any time less than 10 milliseconds is likely to generate too
	 * many signals. Ideally this feature becomes obsolete as
	 * we understand the system better and account for holes.
	 */
	forcedRefreshInterval: number;
}

/**
 * @internal
 */
export class LatestValueControl implements LatestValueControls {
	public allowableUpdateLatency: number;
	private _forcedRefreshInterval: number;

	public constructor(settings: LatestValueControls) {
		this.allowableUpdateLatency = settings.allowableUpdateLatency;
		this._forcedRefreshInterval = settings.forcedRefreshInterval;
	}

	public get forcedRefreshInterval(): number {
		return this._forcedRefreshInterval;
	}
	public set forcedRefreshInterval(value: number) {
		this._forcedRefreshInterval = value < 10 ? 0 : value;
		if (this._forcedRefreshInterval >= 10) {
			// TODO: enable periodic forced refresh
			throw new Error("Forced Refresh feature is not implemented");
		}
	}
}
