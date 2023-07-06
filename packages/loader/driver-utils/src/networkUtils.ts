/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITelemetryErrorEvent } from "@fluidframework/core-interfaces";
import { ITelemetryLoggerExt } from "@fluidframework/telemetry-utils";
import { isOnline, OnlineStatus, canRetryOnError } from "./network";

export function logNetworkFailure(
	logger: ITelemetryLoggerExt,
	event: ITelemetryErrorEvent,
	error?: any,
) {
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
