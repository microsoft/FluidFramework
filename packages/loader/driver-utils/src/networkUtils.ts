/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ITelemetryErrorEventExt } from "@fluidframework/telemetry-utils/internal";
import { ITelemetryLoggerExt } from "@fluidframework/telemetry-utils/internal";

import { OnlineStatus, canRetryOnError, isOnline } from "./network.js";

/**
 * Logs network failure details to telemetry.
 * @internal
 */
export function logNetworkFailure(
	logger: ITelemetryLoggerExt,
	event: ITelemetryErrorEventExt,
	error?: unknown,
): void {
	const newEvent = { ...event };

	// Extract online property if present
	const errorOnlineProp = (error as { online?: string })?.online;
	newEvent.online =
		typeof errorOnlineProp === "string" ? errorOnlineProp : OnlineStatus[isOnline()];

	if (typeof navigator === "object") {
		// Navigator connection info if available
		const nav = navigator as unknown as {
			connection?: unknown;
			mozConnection?: unknown;
			webkitConnection?: unknown;
		};
		const connObj = nav.connection ?? nav.mozConnection ?? nav.webkitConnection;
		if (connObj !== undefined && typeof connObj === "object") {
			const { type } = connObj as { type?: unknown };
			if (typeof type === "string") {
				newEvent.connectionType = type;
			}
		}
	}

	// non-retryable errors are fatal and should be logged as errors
	newEvent.category = canRetryOnError(error) ? "generic" : "error";
	logger.sendTelemetryEvent(newEvent, error);
}
