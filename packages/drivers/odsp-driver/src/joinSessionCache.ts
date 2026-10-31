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

interface JoinInfo {
	promise?: Promise<JoinSessionResult>;
	/**
	 * Earliest request time, in milliseconds since the Unix epoch.
	 * Expiration is checked on access, not maintained by cleanup timers.
	 */
	throttleDeadline?: number;
	/**
	 * Links throttle and wait telemetry for one active window without logging the document key.
	 * It does not participate in request coordination.
	 */
	throttleGateId?: string;
}

interface JoinSessionTelemetry {
	logger: TelemetryLoggerExt;
	caller: string;
}

// setTimeout delays are limited to signed 32-bit integers.
const maximumTimerDelayMs = 2 ** 31 - 1;

/**
 * Clears expired throttle metadata and removes entries with no promise or active deadline.
 */
export function pruneJoinSessionCache(entries: Map<string, JoinInfo>, key: string): void {
	const info = entries.get(key);
	if (info === undefined) {
		return;
	}
	if (info.throttleDeadline !== undefined && info.throttleDeadline <= Date.now()) {
		delete info.throttleDeadline;
		delete info.throttleGateId;
	}
	if (info.promise === undefined && info.throttleDeadline === undefined) {
		entries.delete(key);
	}
}

/**
 * Owns shared join-session promises and server deadlines in one entry per document.
 * The PromiseCache methods preserve the exported cache contract.
 */
export class JoinSessionCache extends PromiseCache<string, JoinSessionResult> {
	/**
	 * Authoritative entries used instead of the superclass's private promise map.
	 */
	private readonly joinInfo = new Map<string, JoinInfo>();

	public override has(key: string): boolean {
		return this.get(key) !== undefined;
	}

	public override get(key: string): Promise<JoinSessionResult> | undefined {
		pruneJoinSessionCache(this.joinInfo, key);
		return this.joinInfo.get(key)?.promise;
	}

	/**
	 * Invalidates a promise without discarding an active server deadline.
	 * Outstanding work can still settle for its existing callers.
	 * Expired throttle-only entries are removed even when there is no promise.
	 * @returns Whether a promise was removed.
	 */
	public override remove(key: string): boolean {
		const info = this.joinInfo.get(key);
		if (info === undefined) {
			return false;
		}
		const hadPromise = info.promise !== undefined;
		delete info.promise;
		pruneJoinSessionCache(this.joinInfo, key);
		return hadPromise;
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
		pruneJoinSessionCache(this.joinInfo, key);
		const info = this.joinInfo.get(key) ?? {};
		if (info.promise !== undefined) {
			return info.promise;
		}

		// Defer the callback so even reentrant callers find the installed promise.
		const promise = Promise.resolve()
			.then(async () => {
				await this.waitForThrottle(key, telemetry);
				return asyncFn();
			})
			.catch((error: unknown) => {
				this.recordThrottle(key, error, telemetry);
				// A removed request must not evict work installed by a later caller.
				if (this.joinInfo.get(key)?.promise === promise) {
					this.remove(key);
				}
				throw error;
			});
		info.promise = promise;
		this.joinInfo.set(key, info);
		return promise;
	}

	private recordThrottle(
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
		pruneJoinSessionCache(this.joinInfo, key);
		const info = this.joinInfo.get(key) ?? {};
		if (info.throttleDeadline !== undefined && info.throttleDeadline >= deadline) {
			return;
		}
		info.throttleDeadline = deadline;
		info.throttleGateId ??= uuid();
		this.joinInfo.set(key, info);
		telemetry?.logger.sendTelemetryEvent(
			{
				eventName: "JoinSessionThrottle",
				throttleGateId: info.throttleGateId,
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
		pruneJoinSessionCache(this.joinInfo, key);
		let info = this.joinInfo.get(key);
		while (info?.throttleDeadline !== undefined) {
			const start = Date.now();
			const scheduledDelayMs = Math.min(info.throttleDeadline - start, maximumTimerDelayMs);
			if (scheduledDelayMs <= 0) {
				// Prune metadata if the deadline expired between clock reads.
				pruneJoinSessionCache(this.joinInfo, key);
				return;
			}
			const props = {
				throttleGateId: info.throttleGateId,
				throttleScope: "clientDocument",
				throttleDeadline: info.throttleDeadline,
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
			pruneJoinSessionCache(this.joinInfo, key);
			info = this.joinInfo.get(key);
		}
	}
}
