/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IDeltaManager } from "@fluidframework/container-definitions/internal";
import type { IDisposable } from "@fluidframework/core-interfaces";
import { assert } from "@fluidframework/core-utils/internal";
import type { ISequencedDocumentMessage } from "@fluidframework/driver-definitions/internal";

/**
 * @see {@link CatchUpMonitor} for usage.
 */
type CaughtUpListener = () => void;

/**
 * Monitor that emits an event when a Container has caught up to a given point in the op stream
 */
export interface ICatchUpMonitor extends IDisposable {
	/**
	 * Evaluate whether the container is already caught up, synchronously notifying the listener if so.
	 * @remarks Must be called after the owner has stored its reference to the monitor.
	 */
	start(): void;
}

/**
 * Monitors a Container's DeltaManager, notifying listeners when all ops have been processed
 * that were known at the time the monitor was created.
 */
export class CatchUpMonitor implements ICatchUpMonitor {
	private readonly targetSeqNumber: number;
	private caughtUp: boolean = false;

	private readonly opHandler = (
		message: Pick<ISequencedDocumentMessage, "sequenceNumber">,
	): void => {
		if (!this.caughtUp && message.sequenceNumber >= this.targetSeqNumber) {
			this.caughtUp = true;
			this.listener();
		}
	};

	/**
	 * Create the CatchUpMonitor, setting the target sequence number to wait for based on DeltaManager's current state.
	 *
	 * @remarks
	 * The constructor only wires up the op listener. Call {@link CatchUpMonitor.start} once the monitor
	 * reference has been stored to evaluate whether the container is already caught up. This ordering is
	 * important: `start` can synchronously invoke the listener (when already caught up), which may re-enter
	 * the owner and observe the monitor. If that synchronous check ran from the constructor, the owner's
	 * field would not yet be assigned, so re-entrant cleanup (e.g. a disconnect) would silently no-op and
	 * leave a stale monitor behind (see assert 0x3eb).
	 */
	constructor(
		private readonly deltaManager: IDeltaManager<unknown, unknown>,
		private readonly listener: CaughtUpListener,
	) {
		this.targetSeqNumber = this.deltaManager.lastKnownSeqNumber;

		assert(
			this.targetSeqNumber >= this.deltaManager.lastSequenceNumber,
			0x37c /* Cannot wait for seqNumber below last processed sequence number */,
		);

		this.deltaManager.on("op", this.opHandler);
	}

	/**
	 * Evaluate whether the container is already caught up, synchronously notifying the listener if so.
	 * @remarks
	 * Must be called by the owner after storing its reference to this monitor, so that any re-entrancy
	 * triggered by the listener observes a fully-constructed, assigned monitor.
	 */
	public start(): void {
		// Simulate the last processed op to set caughtUp in case we already are
		this.opHandler({ sequenceNumber: this.deltaManager.lastSequenceNumber });
	}

	private _disposed: boolean = false;

	/**
	 * {@inheritDoc @fluidframework/core-interfaces#IDisposable.disposed}
	 */
	public get disposed(): boolean {
		return this._disposed;
	}

	/**
	 * {@inheritDoc @fluidframework/core-interfaces#IDisposable.dispose}
	 */
	public dispose(): void {
		if (this._disposed) {
			return;
		}
		this._disposed = true;

		this.deltaManager.off("op", this.opHandler);
	}
}
