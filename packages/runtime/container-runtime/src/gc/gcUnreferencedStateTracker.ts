/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, Timer } from "@fluidframework/common-utils";
import { UnreferencedState } from "./gcDefinitions";

/** A wrapper around common-utils Timer that requires the timeout when calling start/restart */
class TimerWithNoDefaultTimeout extends Timer {
	constructor(private readonly callback: () => void) {
		// The default timeout/handlers will never be used since start/restart pass overrides below
		super(0, () => {
			throw new Error("DefaultHandler should not be used");
		});
	}

	start(timeoutMs: number) {
		super.start(timeoutMs, this.callback);
	}

	restart(timeoutMs: number): void {
		super.restart(timeoutMs, this.callback);
	}
}

/**
 * Helper class that tracks the state of an unreferenced node such as the time it was unreferenced and if it can
 * be deleted by the sweep phase.
 */
export class UnreferencedStateTracker {
	private _state: UnreferencedState = UnreferencedState.Active;
	public get state(): UnreferencedState {
		return this._state;
	}

	/** Timer to indicate when an unreferenced object is considered Inactive */
	private readonly inactiveTimer: TimerWithNoDefaultTimeout;
	/** Timer to indicate when an unreferenced object is Sweep-Ready */
	private readonly sweepTimer: TimerWithNoDefaultTimeout;

	constructor(
		public readonly unreferencedTimestampMs: number,
		/** The time after which node transitions to Inactive state. */
		private readonly inactiveTimeoutMs: number,
		/** The current reference timestamp used to track how long this node has been unreferenced for. */
		currentReferenceTimestampMs: number,
		/** The time after which node transitions to SweepReady state; undefined if session expiry is disabled. */
		private readonly sweepTimeoutMs: number | undefined,
	) {
		if (this.sweepTimeoutMs !== undefined) {
			assert(
				this.inactiveTimeoutMs <= this.sweepTimeoutMs,
				0x3b0 /* inactive timeout must not be greater than the sweep timeout */,
			);
		}

		this.sweepTimer = new TimerWithNoDefaultTimeout(() => {
			this._state = UnreferencedState.SweepReady;
			assert(
				!this.inactiveTimer.hasTimer,
				0x3b1 /* inactiveTimer still running after sweepTimer fired! */,
			);
		});

		this.inactiveTimer = new TimerWithNoDefaultTimeout(() => {
			this._state = UnreferencedState.Inactive;

			// After the node becomes inactive, start the sweep timer after which the node will be ready for sweep.
			if (this.sweepTimeoutMs !== undefined) {
				this.sweepTimer.restart(this.sweepTimeoutMs - this.inactiveTimeoutMs);
			}
		});
		this.updateTracking(currentReferenceTimestampMs);
	}

	/* Updates the unreferenced state based on the provided timestamp. */
	public updateTracking(currentReferenceTimestampMs: number) {
		const unreferencedDurationMs = currentReferenceTimestampMs - this.unreferencedTimestampMs;

		// If the node has been unreferenced for sweep timeout amount of time, update the state to SweepReady.
		if (this.sweepTimeoutMs !== undefined && unreferencedDurationMs >= this.sweepTimeoutMs) {
			this._state = UnreferencedState.SweepReady;
			this.clearTimers();
			return;
		}

		// If the node has been unreferenced for inactive timeoutMs amount of time, update the state to inactive.
		// Also, start a timer for the sweep timeout.
		if (unreferencedDurationMs >= this.inactiveTimeoutMs) {
			this._state = UnreferencedState.Inactive;
			this.inactiveTimer.clear();

			if (this.sweepTimeoutMs !== undefined) {
				this.sweepTimer.restart(this.sweepTimeoutMs - unreferencedDurationMs);
			}
			return;
		}

		// The node is still active. Ensure the inactive timer is running with the proper remaining duration.
		this.inactiveTimer.restart(this.inactiveTimeoutMs - unreferencedDurationMs);
	}

	private clearTimers() {
		this.inactiveTimer.clear();
		this.sweepTimer.clear();
	}

	/** Stop tracking this node. Reset the unreferenced timers and state, if any. */
	public stopTracking() {
		this.clearTimers();
		this._state = UnreferencedState.Active;
	}
}
