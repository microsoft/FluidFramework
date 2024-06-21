/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Custom telemetry properties used in {@link SharedObjectCore} to instantiate {@link TelemetryEventBatcher} class.
 * This interface is used to define the properties that will be passed to the {@link TelemetryEventBatcher.measure} function
 * which is called in the {@link SharedObjectCore.process} method.
 */
export interface ProcessTelemetryProperties {
	sequenceDifference: number;
}
