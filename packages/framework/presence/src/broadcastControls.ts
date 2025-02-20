/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Common controls for Value Managers.
 *
 * @sealed
 * @alpha
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
 * @alpha
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

class ForcedRefreshControl
	implements
		Pick<
			BroadcastControls & { forcedRefreshIntervalMs: number | undefined },
			"forcedRefreshIntervalMs"
		>
{
	private _forcedRefreshInterval: number | undefined;

	public constructor(settings?: BroadcastControlSettings) {
		// this._forcedRefreshInterval = settings?.forcedRefreshIntervalMs;
	}

	public get forcedRefreshIntervalMs(): number | undefined {
		return this._forcedRefreshInterval;
	}
	public set forcedRefreshIntervalMs(value: number | undefined) {
		if (value === undefined) {
			this._forcedRefreshInterval = undefined;
		} else {
			this._forcedRefreshInterval = value >= 10 ? value : undefined;
			if (value >= 10) {
				// TODO: enable periodic forced refresh
				throw new Error("Forced Refresh feature is not implemented");
			}
		}
	}
}

/**
 * @internal
 */
export class OptionalBroadcastControl
	extends ForcedRefreshControl
	implements BroadcastControls
{
	public allowableUpdateLatencyMs: number | undefined;

	public constructor(settings?: BroadcastControlSettings) {
		super(settings);
		this.allowableUpdateLatencyMs = settings?.allowableUpdateLatencyMs;
	}
}

/**
 * Implements {@link BroadcastControls} but always provides defined value for
 * {@link BroadcastControls.allowableUpdateLatencyMs | allowableUpdateLatencyMs}.
 *
 * If {@link BroadcastControls.allowableUpdateLatencyMs | allowableUpdateLatencyMs}
 * is set to `undefined`, the default will be restored.
 *
 * @internal
 */
export class RequiredBroadcastControl
	extends ForcedRefreshControl
	implements BroadcastControls
{
	private _allowableUpdateLatencyMs: number;

	public constructor(private readonly defaultAllowableUpdateLatencyMs: number) {
		super();
		this._allowableUpdateLatencyMs = defaultAllowableUpdateLatencyMs;
	}

	public get allowableUpdateLatencyMs(): number {
		return this._allowableUpdateLatencyMs;
	}
	public set allowableUpdateLatencyMs(value: number | undefined) {
		this._allowableUpdateLatencyMs = value ?? this.defaultAllowableUpdateLatencyMs;
	}
}
