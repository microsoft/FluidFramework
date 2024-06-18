/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Telemetry properties to include for the {@link TelemetryEventBatcher} logger.
 * The set of properties must be the same for all calls to the `measure` function.
 */
export interface ITelemetryProperties {
	sequenceDifference: number;
	[key: string]: number;
}
