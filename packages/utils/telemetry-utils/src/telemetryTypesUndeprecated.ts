/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable import-x/no-deprecated -- This file specifically works with deprecated types to undeprecate them for internal use */

// This file contains exports that "un-deprecate" certain types that we want to
// continue using internally while exposing deprecated version that will be
// removed in a future release.

// For internal maintenance convenience, we re-export some non-deprecated types
// from telemetryTypes.ts too.
export type { TelemetryLoggerExt } from "./telemetryTypes.js";

import type {
	ITelemetryGenericEventExt as ExposedITelemetryGenericEventExt,
	ITelemetryErrorEventExt as ExposedITelemetryErrorEventExt,
	ITelemetryPerformanceEventExt as ExposedITelemetryPerformanceEventExt,
	TelemetryEventCategory as ExposedTelemetryEventCategory,
} from "./telemetryTypes.js";

/**
 * Informational (non-error) telemetry event
 * @remarks Maps to category = "generic"
 * @internal
 */
export type ITelemetryGenericEventExt = ExposedITelemetryGenericEventExt;
/**
 * Error telemetry event.
 * @remarks Maps to category = "error"
 * @internal
 */
export type ITelemetryErrorEventExt = ExposedITelemetryErrorEventExt;
/**
 * Performance telemetry event.
 * @remarks Maps to category = "performance"
 * @internal
 */
export type ITelemetryPerformanceEventExt = ExposedITelemetryPerformanceEventExt;
/**
 * The categories FF uses when instrumenting the code.
 *
 * generic - Informational log event
 *
 * error - Error log event, ideally 0 of these are logged during a session
 *
 * performance - Includes duration, and often has _start, _end, or _cancel suffixes for activity tracking
 * @internal
 */
export type TelemetryEventCategory = ExposedTelemetryEventCategory;
