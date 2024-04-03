/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ContainerTelemetryEventName } from "../../container/index.js";

/**
 * The base interface extended by all external telemetry
 *
 * @see {@link @fluidframework/external-telemetry#IContainerTelemetry} for an extension of this interface for all container related telemetry.
 *
 * @beta
 */
export interface IExternalTelemetry {
	/**
	 * The unique name of the telemetry event. The event name contains scope concatenated together
	 * with periods to enable more granular log searching
	 *
	 * @example
	 * "fluidframework.container.connected"
	 */
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
