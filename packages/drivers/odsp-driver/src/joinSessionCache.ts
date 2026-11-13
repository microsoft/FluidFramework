/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { PromiseCache } from "@fluidframework/core-utils/internal";
import { getRetryDelayFromError } from "@fluidframework/driver-utils/internal";
import type { ISocketStorageDiscovery } from "@fluidframework/odsp-driver-definitions/internal";
import {
	isFluidError,
	type TelemetryLoggerExt,
} from "@fluidframework/telemetry-utils/internal";
import { v4 as uuid } from "uuid";

interface JoinSessionResult {
	entryTime: number;
	joinSessionResponse: ISocketStorageDiscovery;
}

interface JoinSessionThrottle {
	/**
	 * Earliest request time, in milliseconds since the Unix epoch.
	 */
	deadline: number;
	/**
	 * Links throttle and wait telemetry for one active window without logging the document key.
	 * It does not participate in request coordination.
	 */
	gateId: string;
}

interface JoinSessionTelemetry {
	logger: TelemetryLoggerExt;
	caller: string;
}

// setTimeout delays are limited to signed 32-bit integers.
const maximumTimerDelayMs = 2 ** 31 - 1;

/**
 * Adds server-directed waits to the work shared by PromiseCache.
 * Server deadlines survive promise rejection, invalidation, and expiration.
 */
export class JoinSessionCache extends PromiseCache<string, JoinSessionResult> {
	private readonly throttles = new Map<string, JoinSessionThrottle>();
	private throttleCleanupTimer: ReturnType<typeof setTimeout> | undefined;

	/**
	 * Invalidates a promise without discarding an active server deadline.
	 * Outstanding work can still settle for its existing callers.
	 * Expired deadlines are removed even when there is no promise.
	 * @returns Whether a promise was removed.
	 */
	public override remove(key: string): boolean {
		this.pruneThrottle(key);
		return super.remove(key);
	}

	/**
	 * Installs shared work before it starts, including any server-directed wait.
	 * @param key - Document cache key.
	 * @param asyncFn - Fetches fresh session information.
	 * @param telemetry - Optional diagnostics for the shared operation.
	 * @returns The existing or newly scheduled result.
	 */
	public override async addOrGet(
		key: string,
		asyncFn: () => Promise<JoinSessionResult>,
		telemetry?: JoinSessionTelemetry,
	): Promise<JoinSessionResult> {
		this.pruneThrottle(key);
		return super.addOrGet(key, async () => {
			// Install the shared promise before waiting or fetching can invoke reentrant callbacks.
			await Promise.resolve();
			await this.waitForThrottle(key, telemetry);
			try {
				return await asyncFn();
			} catch (error: unknown) {
				this.recordThrottleIfApplicable(key, error, telemetry);
				throw error;
			}
		});
	}

	private pruneThrottle(key: string): void {
		const throttle = this.throttles.get(key);
		if (throttle !== undefined && throttle.deadline <= Date.now()) {
			this.throttles.delete(key);
			if (this.throttles.size === 0 && this.throttleCleanupTimer !== undefined) {
				clearTimeout(this.throttleCleanupTimer);
				this.throttleCleanupTimer = undefined;
			}
		}
	}

	/**
	 * Reclaims abandoned metadata once all current deadlines have expired.
	 * New deadlines do not reschedule an existing timer; each wake checks the latest deadline.
	 * Continuous throttling can defer this batch cleanup, while access still prunes expired entries.
	 */
	private scheduleThrottleCleanup(): void {
		if (this.throttleCleanupTimer !== undefined) {
			return;
		}
		let latestDeadline = Date.now();
		for (const throttle of this.throttles.values()) {
			latestDeadline = Math.max(latestDeadline, throttle.deadline);
		}
		const remainingMs = latestDeadline - Date.now();
		if (remainingMs <= 0) {
			this.throttles.clear();
			return;
		}
		this.throttleCleanupTimer = setTimeout(
			() => {
				this.throttleCleanupTimer = undefined;
				this.scheduleThrottleCleanup();
			},
			Math.min(remainingMs, maximumTimerDelayMs),
		);
		// Metadata cleanup must not keep a Node.js process alive.
		const timer = this.throttleCleanupTimer as number | { unref(): void };
		if (typeof timer !== "number") {
			timer.unref();
		}
	}

	private recordThrottleIfApplicable(
		key: string,
		error: unknown,
		telemetry: JoinSessionTelemetry | undefined,
	): void {
		const statusCode = isFluidError(error)
			? error.getTelemetryProperties().statusCode
			: undefined;
		const retryAfterMs = getRetryDelayFromError(error);
		if (
			statusCode !== 429 ||
			retryAfterMs === undefined ||
			!Number.isFinite(retryAfterMs) ||
			retryAfterMs <= 0
		) {
			return;
		}
		const deadline = Date.now() + Math.ceil(retryAfterMs);
		if (!Number.isSafeInteger(deadline)) {
			telemetry?.logger.sendErrorEvent(
				{
					eventName: "JoinSessionThrottleInvalidRetryAfter",
					serverRetryAfterMs: retryAfterMs,
				},
				error,
			);
			return;
		}
		this.pruneThrottle(key);
		const existing = this.throttles.get(key);
		if (existing !== undefined && existing.deadline >= deadline) {
			return;
		}
		const throttle = { deadline, gateId: existing?.gateId ?? uuid() };
		this.throttles.set(key, throttle);
		this.scheduleThrottleCleanup();
		telemetry?.logger.sendTelemetryEvent(
			{
				eventName: "JoinSessionThrottle",
				throttleGateId: throttle.gateId,
				throttleScope: "clientDocument",
				serverRetryAfterMs: retryAfterMs,
				throttleDeadline: deadline,
			},
			error,
		);
	}

	private async waitForThrottle(
		key: string,
		telemetry: JoinSessionTelemetry | undefined,
	): Promise<void> {
		while (true) {
			this.pruneThrottle(key);
			const throttle = this.throttles.get(key);
			if (throttle === undefined) {
				return;
			}
			const start = Date.now();
			const scheduledDelayMs = Math.min(throttle.deadline - start, maximumTimerDelayMs);
			if (scheduledDelayMs <= 0) {
				// Prune metadata if the deadline expired between clock reads.
				this.pruneThrottle(key);
				return;
			}
			const props = {
				throttleGateId: throttle.gateId,
				throttleScope: "clientDocument",
				throttleDeadline: throttle.deadline,
				scheduledDelayMs,
				joinSessionCaller: telemetry?.caller,
			};
			telemetry?.logger.sendTelemetryEvent({ eventName: "JoinSessionThrottleWait", ...props });
			await new Promise<void>((resolve) => setTimeout(resolve, scheduledDelayMs));
			telemetry?.logger.sendTelemetryEvent({
				eventName: "JoinSessionThrottleWait_end",
				...props,
				observedDelayMs: Date.now() - start,
			});
		}
	}
}
