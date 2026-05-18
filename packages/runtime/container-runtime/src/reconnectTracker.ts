/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ITelemetryLoggerExt } from "@fluidframework/telemetry-utils/internal";

/**
 * Tracks how many times the container has reconnected with pending messages
 * still outstanding. If the count reaches the configured maximum the container
 * is considered stuck — calls to {@link ReconnectTracker.shouldContinue} return
 * `false`, signaling the runtime to fail the container.
 *
 * The counter is reset whenever a local op is acked (`reset`) or whenever
 * `shouldContinue` is asked while there are no pending messages.
 *
 * @internal
 */
export class ReconnectTracker {
	private count = 0;

	constructor(
		private readonly max: number,
		private readonly hasPendingMessages: () => boolean,
		private readonly pendingMessagesCount: () => number,
		private readonly logger: ITelemetryLoggerExt,
	) {}

	public get attempts(): number {
		return this.count;
	}

	public recordReconnect(): void {
		this.count++;
	}

	public reset(): void {
		this.count = 0;
	}

	public shouldContinue(): boolean {
		if (this.max <= 0) {
			// Feature disabled, we never stop reconnecting
			return true;
		}

		if (!this.hasPendingMessages()) {
			// If there are no pending messages, we can always reconnect
			this.reset();
			return true;
		}

		if (this.count === Math.floor(this.max / 2)) {
			// If we're halfway through the max reconnects, send an event in order
			// to better identify false positives, if any. If the rate of this event
			// matches Container Close count below, we can safely cut down the max
			// to half.
			this.logger.sendTelemetryEvent({
				eventName: "ReconnectsWithNoProgress",
				attempts: this.count,
				pendingMessages: this.pendingMessagesCount(),
			});
		}

		return this.count < this.max;
	}
}
