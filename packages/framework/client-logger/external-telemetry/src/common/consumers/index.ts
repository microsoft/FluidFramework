/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Base interface for all telemetry consumers.
 */
export interface ITelemetryConsumer {
	consume(event: Record<string, any>);
}

export { AppInsightsTelemetryConsumer } from "./appInsightsTelemetryConsumer";
