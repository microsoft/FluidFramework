/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable import-x/no-deprecated */

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

/** @internal */
export type ITelemetryGenericEventExt = ExposedITelemetryGenericEventExt;
/** @internal */
export type ITelemetryErrorEventExt = ExposedITelemetryErrorEventExt;
/** @internal */
export type ITelemetryPerformanceEventExt = ExposedITelemetryPerformanceEventExt;
/** @internal */
export type TelemetryEventCategory = ExposedTelemetryEventCategory;
