/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IDeltaManager } from "@fluidframework/container-definitions/internal";
import { IDisposable } from "@fluidframework/core-interfaces";
import { assert } from "@fluidframework/core-utils/internal";
import { ISequencedDocumentMessage } from "@fluidframework/driver-definitions/internal";

/**
 * @see {@link CatchUpMonitor} for usage.
 */
type CaughtUpListener = () => void;

/**
 * Monitor that emits an event when a Container has caught up to a given point in the op stream
 */
export type ICatchUpMonitor = IDisposable;

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
