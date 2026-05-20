/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// This export set contains public APIs that don't have any special treatment
// when exposed internally. APIs deprecated for external use but still needed
// internally are re-exported from /internal with alternate tagging.

export { EventEmitterWithErrorHandling } from "./eventEmitterWithErrorHandling.js";
export type {
	ITelemetryLoggerPropertyBag,
	ITelemetryLoggerPropertyBags,
	TelemetryEventPropertyTypes,
} from "./logger.js";
export type {
	ITelemetryPropertiesExt,
	TelemetryEventPropertyTypeExt,
} from "./telemetryTypes.js";
