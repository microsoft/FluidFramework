/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ContainerTelemetryEventName } from "../../container";

/**
 * The base interface extended by all external telemetry
 */
export interface IExternalTelemetry {
	eventName: ExternalTelemetryEventName;
}

/**
 * Aggregate type for all the different types of external telemetry event names.
 *
 * @remarks This only looks odd right now because {@link ContainerEventName} is the only option at the moment.
 */
export type ExternalTelemetryEventName = ContainerTelemetryEventName;
