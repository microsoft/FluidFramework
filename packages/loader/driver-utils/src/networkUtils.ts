/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ITelemetryErrorEventExt } from "@fluidframework/telemetry-utils/internal";
import type { ITelemetryLoggerExt } from "@fluidframework/telemetry-utils/internal";

import { OnlineStatus, canRetryOnError, isOnline } from "./network.js";

/**
 * Logs a network failure with additional context about online status and retry capability for the provided event.
 *
 * @internal
 */
export function logNetworkFailure(
	logger: ITelemetryLoggerExt,
	event: ITelemetryErrorEventExt,
	error?: any,
): void {
	const newEvent = { ...event };

	const errorOnlineProp = error?.online;
	newEvent.online =
		typeof errorOnlineProp === "string" ? errorOnlineProp : OnlineStatus[isOnline()];

	if (typeof navigator === "object" && navigator !== null) {
		const nav = navigator as any;
		const connection = nav.connection ?? nav.mozConnection ?? nav.webkitConnection;
		if (connection !== null && typeof connection === "object") {
			newEvent.connectionType = connection.type;
		}
	}

	// non-retryable errors are fatal and should be logged as errors
	newEvent.category = canRetryOnError(error) ? "generic" : "error";
	logger.sendTelemetryEvent(newEvent, error);
}
