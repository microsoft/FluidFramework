/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { BroadcastControlSettings, BroadcastControls } from "./broadcastControlsTypes.js";

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
 * Implements {@link BroadcastControls} for States Managers
 * where returning `undefined` settings are allowed.
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
