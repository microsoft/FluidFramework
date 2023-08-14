/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITelemetryPropertiesExt } from "@fluidframework/core-interfaces";

/**
 * Interface for logging telemetry statements.
 * Can contain any number of properties that get serialized as json payload.
 * @param category - category of the event, like "error", "performance", "generic", etc.
 * @param eventName - name of the event.
 */
export interface ITelemetryEventExt extends ITelemetryPropertiesExt {
	category: string;
	eventName: string;
}
