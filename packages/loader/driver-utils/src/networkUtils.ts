/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type {
	ITelemetryErrorEventExt,
	ITelemetryLoggerExt,
} from "@fluidframework/telemetry-utils/internal";

import { OnlineStatus, canRetryOnError, isOnline } from "./network.js";

/**
 * Logs a network failure with additional context about online status and retry capability for the provided event.
 *
 * @internal
 */
export function logNetworkFailure(
	logger: ITelemetryLoggerExt,
	event: ITelemetryErrorEventExt,
	error?: unknown,
): void {
	const newEvent = { ...event };

	// TODO: better typing
	const errorOnlineProp = (error as { online?: unknown })?.online;
	newEvent.online =
		typeof errorOnlineProp === "string" ? errorOnlineProp : OnlineStatus[isOnline()];

	if (typeof navigator === "object" && navigator !== null) {
		// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any -- TODO: use a real type
		const nav = navigator as any;
		// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
		const connection = nav.connection ?? nav.mozConnection ?? nav.webkitConnection;
		if (connection !== null && typeof connection === "object") {
			// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
			newEvent.connectionType = connection.type;
		}
	}

	// non-retryable errors are fatal and should be logged as errors
	newEvent.category = canRetryOnError(error) ? "generic" : "error";
	logger.sendTelemetryEvent(newEvent, error);
}
