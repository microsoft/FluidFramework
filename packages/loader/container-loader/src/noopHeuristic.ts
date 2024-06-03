/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { TypedEventEmitter } from "@fluid-internal/client-utils";
import { IEvent } from "@fluidframework/core-interfaces";
import { assert, Timer } from "@fluidframework/core-utils/internal";
import { ISequencedDocumentMessage } from "@fluidframework/driver-definitions";
import { isRuntimeMessage } from "@fluidframework/driver-utils/internal";

const defaultNoopTimeFrequency = 2000;
const defaultNoopCountFrequency = 50;

export interface INoopSenderEvents extends IEvent {
	(event: "wantsNoop", listener: () => void);
}

// Here are key considerations when deciding conditions for when to send non-immediate noops:
// 1. Sending them too often results in increase in file size and bandwidth, as well as catch up performance
// 2. Sending too infrequently ensures that collab window is large, and as result Sequence DDS would have
//    large catchUp blobs - see Issue #6364
// 3. Similarly, processes that rely on "core" snapshot (and can't parse trailing ops, including above), like search
//    parser in SPO, will result in non-accurate results due to presence of catch up blobs.
// 4. Ordering service used 250ms timeout to coalesce non-immediate noops. It was changed to 2000 ms to allow more
//    aggressive noop sending from client side.
// 5. Number of ops sent by all clients is proportional to number of "write" clients (every client sends noops),
//    but number of sequenced noops is a function of time (one op per 2 seconds at most).
//    We should consider impact to both outbound traffic (might be huge, depends on number of clients) and file size.
// Please also see Issue #5629 for more discussions.
//
// With that, the current algorithm is as follows:
// 1. Sent noop 2000 ms of receiving an op if no ops were sent by this client within this timeframe.
//    This will ensure that MSN moves forward with reasonable speed. If that results in too many sequenced noops,
//    server timeout of 2000ms should be reconsidered to be increased.
// 2. If there are more than 50 ops received without sending any ops, send noop to keep collab window small.
//    Note that system ops (including noops themselves) are excluded, so it's 1 noop per 50 real ops.
export class NoopHeuristic extends TypedEventEmitter<INoopSenderEvents> {
	private opsProcessedSinceOpSent = 0;
	private readonly timer: Timer | undefined;

	constructor(
		NoopTimeFrequency: number = defaultNoopTimeFrequency,
		private readonly NoopCountFrequency: number = defaultNoopCountFrequency,
	) {
		super();
		if (NoopTimeFrequency !== Infinity) {
			this.timer = new Timer(NoopTimeFrequency, () => {
				// We allow the timer to expire even if an op is sent or we disconnect.
				// This condition is to guard against trying to send a noop anyway in that case.
				if (this.opsProcessedSinceOpSent !== 0) {
					this.emit("wantsNoop");
				}
			});
		}
	}

	/**
	 * Schedules as ack to the server to update the reference sequence number
	 */
	public notifyMessageProcessed(message: ISequencedDocumentMessage): void {
		// We don't acknowledge no-ops to avoid acknowledgement cycles (i.e. ack the MSN
		// update, which updates the MSN, then ack the update, etc...).
		// Intent here is for runtime (and DDSes) not to keep too much tracking state / memory
		// due to runtime ops from other clients.
		if (!isRuntimeMessage(message)) {
			return;
		}

		this.opsProcessedSinceOpSent++;
		if (this.opsProcessedSinceOpSent === this.NoopCountFrequency) {
			// Wait to send a noop if we are still synchronously processing ops.  This guards against two things:
			// 1. If we're processing many ops, we may pass the frequency threshold many times.  We only need to send one noop at the very end in this case.
			// 2. We may send another (non-noop) op in response to processing those ops, e.g. an Accept op.
			queueMicrotask(() => {
				if (this.opsProcessedSinceOpSent >= this.NoopCountFrequency) {
					this.emit("wantsNoop");
					assert(
						this.opsProcessedSinceOpSent === 0,
						0x243 /* "Expected a noop to be synchronously sent" */,
					);
				}
				return;
			});
		}

		if (this.timer !== undefined) {
			// Start the timer if we newly have ops that want a noop.
			// If the timer was already running (e.g. we surpassed the op count and sent a noop) this will reset it to its full duration.
			if (this.opsProcessedSinceOpSent === 1) {
				this.timer.restart();
			}

			assert(this.timer.hasTimer, 0x242 /* "has timer" */);
		}
	}

	public notifyDisconnect(): void {
		// No need to noop for any ops processed prior to disconnect - we are already removed from MSN calculation.
		this.opsProcessedSinceOpSent = 0;
	}

	public notifyMessageSent(): void {
		// Sending any message is as good as a noop for updating MSN.
		this.opsProcessedSinceOpSent = 0;
	}
}
