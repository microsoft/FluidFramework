/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITelemetryBaseEvent } from "@fluidframework/common-definitions";

/**
 * Interface for telemetry events with a timestamp. Specific to the Fluid Debugger.
 *
 * @public
 */
export interface ITimestampedTelemetryEvent {
	/**
	 * The contents of the telemetry event.
	 */
	logContent: ITelemetryBaseEvent;

	/**
	 * The timestamp at which the event was logged. {@link Date#now}. i.e. MM/DD/YYYY, HH:MM:SS AM/PM.
	 */
	timestamp: number;
}
