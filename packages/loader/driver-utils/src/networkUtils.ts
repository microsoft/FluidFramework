/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ITelemetryErrorEventExt } from "@fluidframework/telemetry-utils/internal";
import { ITelemetryLoggerExt } from "@fluidframework/telemetry-utils/internal";

import { OnlineStatus, canRetryOnError, isOnline } from "./network.js";

/**
 * Log a network failure, enriching the event with online/connection details and severity based on retryability.
 *
 * @internal
 */
export function logNetworkFailure(
	logger: ITelemetryLoggerExt,
	event: ITelemetryErrorEventExt,
	error?: unknown,
): void {
	const newEvent = { ...event };

	const errorOnlineProp = (error as { online?: string } | undefined)?.online;
	newEvent.online =
		typeof errorOnlineProp === "string" ? errorOnlineProp : OnlineStatus[isOnline()];

	if (typeof navigator === "object" && navigator !== null) {
		// Narrow navigator with known optional connection properties used by some browsers
		const nav = navigator as Navigator & {
			connection?: { type?: string } | null;
			mozConnection?: { type?: string } | null;
			webkitConnection?: { type?: string } | null;
		};
		const connection = nav.connection ?? nav.mozConnection ?? nav.webkitConnection;
		if (connection !== null && typeof connection === "object") {
			newEvent.connectionType = connection.type;
		}
	}

	// non-retryable errors are fatal and should be logged as errors
	newEvent.category = canRetryOnError(error) ? "generic" : "error";
	logger.sendTelemetryEvent(newEvent, error as Error | undefined);
}
