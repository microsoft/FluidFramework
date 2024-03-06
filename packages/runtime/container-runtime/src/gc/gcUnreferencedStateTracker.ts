/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, Timer } from "@fluidframework/core-utils";
import { validatePrecondition } from "@fluidframework/telemetry-utils";
import { UnreferencedState } from "./gcDefinitions.js";

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

/** The collection of UnreferencedStateTrackers for all unreferenced nodes. Ensures stopTracking is called when deleting */
export class UnreferencedStateTrackerMap extends Map<string, UnreferencedStateTracker> {
	/** Delete the given key, and stop tracking if that node was actually unreferenced */
	delete(key: string): boolean {
		// Stop tracking so as to clear out any running timers.
		this.get(key)?.stopTracking();
		// Delete the node as we don't need to track it any more.
		return super.delete(key);
	}
}

/**
 * Helper class that tracks the state of an unreferenced node such as the time it was unreferenced and if it can
 * be tombstoned or deleted by the sweep phase.
 */
export class UnreferencedStateTracker {
	private _state: UnreferencedState = UnreferencedState.Active;
	public get state(): UnreferencedState {
		return this._state;
	}

	/** Timer to indicate when an unreferenced object is considered Inactive */
	private readonly inactiveTimer: TimerWithNoDefaultTimeout;
	/** Timer to indicate when an unreferenced object is Tombstone-Ready */
	private readonly tombstoneTimer: TimerWithNoDefaultTimeout;
	/** Timer to indicate when an unreferenced object is Sweep-Ready */
	private readonly sweepTimer: TimerWithNoDefaultTimeout;

	constructor(
		public readonly unreferencedTimestampMs: number,
		/** The time after which node transitions to Inactive state. */
		private readonly inactiveTimeoutMs: number,
		/** The current reference timestamp used to track how long this node has been unreferenced for. */
		currentReferenceTimestampMs: number,
		/** The time after which node transitions to TombstoneReady state; undefined if session expiry is disabled. */
		private readonly tombstoneTimeoutMs: number | undefined,
		/** The delay from TombstoneReady to SweepReady (only applies if tombstoneTimeoutMs is defined) */
		private readonly sweepGracePeriodMs: number,
	) {
		validatePrecondition(
			this.tombstoneTimeoutMs === undefined ||
				this.tombstoneTimeoutMs >= this.inactiveTimeoutMs,
			"inactiveTimeoutMs must not be greater than the tombstoneTimeoutMs",
		);

		this.sweepTimer = new TimerWithNoDefaultTimeout(() => {
			this._state = UnreferencedState.SweepReady;
			assert(
				!this.inactiveTimer.hasTimer && !this.tombstoneTimer.hasTimer,
				0x863 /* inactiveTimer or tombstoneTimer still running after sweepTimer fired! */,
			);
		});

		this.tombstoneTimer = new TimerWithNoDefaultTimeout(() => {
			this._state = UnreferencedState.TombstoneReady;
			assert(
				!this.inactiveTimer.hasTimer,
				0x864 /* inactiveTimer still running after tombstoneTimer fired! */,
			); // aka 0x3b1

			if (this.sweepGracePeriodMs > 0) {
				// After the node becomes tombstone ready, start the sweep timer after which the node will be ready for sweep.
				this.sweepTimer.restart(this.sweepGracePeriodMs);
			} else {
				this._state = UnreferencedState.SweepReady;
			}
		});

		this.inactiveTimer = new TimerWithNoDefaultTimeout(() => {
			this._state = UnreferencedState.Inactive;

			// After the node becomes inactive, start the tombstone timer after which the node will be ready for tombstone.
			if (this.tombstoneTimeoutMs !== undefined) {
				this.tombstoneTimer.restart(this.tombstoneTimeoutMs - this.inactiveTimeoutMs);
			}
		});

		this.updateTracking(currentReferenceTimestampMs);
	}

	/* Updates the unreferenced state based on the provided timestamp. */
	public updateTracking(currentReferenceTimestampMs: number) {
		const unreferencedDurationMs = currentReferenceTimestampMs - this.unreferencedTimestampMs;

		// Below we will set the appropriate timer (or none). Any running timers are superceded by the new currentReferenceTimestampMs
		this.clearTimers();

		// If the node has been unreferenced long enough, update the state to SweepReady.
		if (
			this.tombstoneTimeoutMs !== undefined &&
			unreferencedDurationMs >= this.tombstoneTimeoutMs + this.sweepGracePeriodMs
		) {
			this._state = UnreferencedState.SweepReady;
			return;
		}

		// If the node has been unreferenced long enough, update the state to TombstoneReady.
		// Also, start a timer for the remainder of the sweep delay.
		if (
			this.tombstoneTimeoutMs !== undefined &&
			unreferencedDurationMs >= this.tombstoneTimeoutMs
		) {
			this._state = UnreferencedState.TombstoneReady;

			this.sweepTimer.restart(
				this.tombstoneTimeoutMs + this.sweepGracePeriodMs - unreferencedDurationMs,
			);
			return;
		}

		// If the node has been unreferenced for long enough, update the state to inactive.
		// Also, start a timer for the remainder of the tombstone timeout.
		if (unreferencedDurationMs >= this.inactiveTimeoutMs) {
			this._state = UnreferencedState.Inactive;

			if (this.tombstoneTimeoutMs !== undefined) {
				this.tombstoneTimer.restart(this.tombstoneTimeoutMs - unreferencedDurationMs);
			}
			return;
		}

		// The node is still active. Ensure the inactive timer is running with the proper remaining duration.
		this.inactiveTimer.restart(this.inactiveTimeoutMs - unreferencedDurationMs);
	}

	private clearTimers() {
		this.inactiveTimer.clear();
		this.tombstoneTimer.clear();
		this.sweepTimer.clear();
	}

	/** Stop tracking this node. Reset the unreferenced timers and state, if any. */
	public stopTracking() {
		this.clearTimers();
		this._state = UnreferencedState.Active;
	}
}
