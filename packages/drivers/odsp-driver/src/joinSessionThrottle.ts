/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	getRetryDelayFromError,
	NonRetryableError,
} from "@fluidframework/driver-utils/internal";
import { OdspErrorTypes } from "@fluidframework/odsp-driver-definitions/internal";
import {
	isFluidError,
	type TelemetryLoggerExt,
} from "@fluidframework/telemetry-utils/internal";

import type { INonPersistentCache } from "./odspCache.js";
import { getOdspTargetId } from "./odspOperation.js";
import { pkgVersion as driverVersion } from "./packageVersion.js";

interface ThrottleWindow {
	deadline: number;
	readonly id: string;
	timer: ReturnType<typeof setTimeout>;
}

const coordinators = new WeakMap<
	INonPersistentCache["sessionJoinCache"],
	JoinSessionThrottle
>();
const maximumTimerDelayMs = 2 ** 31 - 1;

/**
 * Shares server deadlines within the same client's join-session cache, independently of cached promises.
 */
export function getJoinSessionThrottle(cache: INonPersistentCache): JoinSessionThrottle {
	let coordinator = coordinators.get(cache.sessionJoinCache);
	if (coordinator === undefined) {
		coordinator = new JoinSessionThrottle();
		coordinators.set(cache.sessionJoinCache, coordinator);
	}
	return coordinator;
}

export function checkJoinSessionDisposed(signal: AbortSignal): void {
	if (signal.aborted) {
		throw disposedError();
	}
}

function disposedError(): NonRetryableError<typeof OdspErrorTypes.genericError> {
	return new NonRetryableError(
		"Document service is disposed. Cannot join session",
		OdspErrorTypes.genericError,
		{ driverVersion },
	);
}

/**
 * Retains the maximum active 429 deadline for each document and removes expired windows.
 */
export class JoinSessionThrottle {
	private readonly windows = new Map<string, ThrottleWindow>();

	public getGateId(key: string): string {
		return getOdspTargetId(this, key);
	}

	public record(key: string, error: unknown, logger: TelemetryLoggerExt): void {
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
		const deadline = Date.now() + retryAfterMs;
		const previous = this.windows.get(key);
		if (previous !== undefined && previous.deadline >= deadline) {
			return;
		}
		if (previous !== undefined) {
			clearTimeout(previous.timer);
		}
		const expire = (): void => {
			const remaining = deadline - Date.now();
			if (remaining > 0) {
				window.timer = setTimeout(expire, Math.min(remaining, maximumTimerDelayMs));
			} else if (this.windows.get(key) === window) {
				this.windows.delete(key);
			}
		};
		const window: ThrottleWindow = {
			deadline,
			id: this.getGateId(key),
			timer: setTimeout(expire, Math.min(retryAfterMs, maximumTimerDelayMs)),
		};
		this.windows.set(key, window);
		logger.sendTelemetryEvent(
			{
				eventName: "JoinSessionThrottle",
				throttleGateId: window.id,
				throttleScope: "clientDocument",
				serverRetryAfterMs: retryAfterMs,
				throttleDeadline: deadline,
			},
			error,
		);
	}

	public async wait(
		key: string,
		signal: AbortSignal,
		logger: TelemetryLoggerExt,
		caller: string,
	): Promise<void> {
		checkJoinSessionDisposed(signal);
		let window = this.windows.get(key);
		while (window !== undefined && window.deadline > Date.now()) {
			const scheduledDelayMs = Math.min(window.deadline - Date.now(), maximumTimerDelayMs);
			const start = Date.now();
			const props = {
				throttleGateId: window.id,
				throttleScope: "clientDocument",
				throttleDeadline: window.deadline,
				scheduledDelayMs,
				joinSessionCaller: caller,
			};
			logger.sendTelemetryEvent({ eventName: "JoinSessionThrottleWait", ...props });
			try {
				await new Promise<void>((resolve, reject) => {
					const abort = (): void => {
						clearTimeout(timer);
						reject(disposedError());
					};
					const timer = setTimeout(() => {
						signal.removeEventListener("abort", abort);
						resolve();
					}, scheduledDelayMs);
					signal.addEventListener("abort", abort, { once: true });
				});
				logger.sendTelemetryEvent({
					eventName: "JoinSessionThrottleWait_end",
					...props,
					observedDelayMs: Date.now() - start,
				});
			} catch (error) {
				logger.sendTelemetryEvent(
					{
						eventName: "JoinSessionThrottleWait_cancel",
						...props,
						observedDelayMs: Date.now() - start,
					},
					error,
				);
				throw error;
			}
			checkJoinSessionDisposed(signal);
			window = this.windows.get(key);
		}
	}
}
