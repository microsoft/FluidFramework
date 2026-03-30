/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// eslint-disable-next-line no-restricted-syntax
export * from "./main.js";

// Additional APIs that are deprecated and thus left out of the common export set.
export type {
	ITelemetryErrorEventExt,
	ITelemetryGenericEventExt,
	ITelemetryLoggerExt,
	ITelemetryPerformanceEventExt,
	TelemetryEventCategory,
} from "./telemetryTypes.js";

// ----------------------------------------------------------------------------
// Export `createChildLogger` helper without internal `TelemetryLoggerExt`

import type { ITelemetryBaseLogger } from "@fluidframework/core-interfaces";

import type { ITelemetryLoggerPropertyBags } from "./logger.js";
import { createChildLogger as createChildLoggerInternal } from "./logger.js";
import type { ITelemetryLoggerExt } from "./telemetryTypes.js";

/**
 * Create a child logger based on the provided props object.
 *
 * @remarks
 * Passing in no props object (i.e. undefined) will return a logger that is effectively a no-op.
 *
 * @param props - logger is the base logger the child will log to after it's processing, namespace will be prefixed to all event names, properties are default properties that will be applied events.
 *
 * @legacy
 * @beta
 */
export function createChildLogger(props?: {
	logger?: ITelemetryBaseLogger;
	namespace?: string;
	properties?: ITelemetryLoggerPropertyBags;
}): ITelemetryLoggerExt {
	return createChildLoggerInternal(props);
}
