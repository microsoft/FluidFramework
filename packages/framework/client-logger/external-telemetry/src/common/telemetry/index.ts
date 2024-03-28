/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ContainerTelemetryEventName } from "../../container/index.js";

/**
 * The base interface extended by all external telemetry
 *
 * @beta
 */
export interface IExternalTelemetry {
	eventName: ExternalTelemetryEventName;
}

/**
 * Aggregate type for all the different types of external telemetry event names.
 *
 * @privateremarks This only looks odd right now because {@link ContainerTelemetryEventName} is the only aggregation at the moment.
 *
 * @beta
 */
export type ExternalTelemetryEventName = ContainerTelemetryEventName;
