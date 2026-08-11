/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ContainerTelemetryEventName } from "../../container/index.js";

/**
 * The base interface extended by all Fluid telemetry
 *
 * @see {@link @fluidframework/fluid-telemetry#IContainerTelemetry} for an extension of this interface for all container related telemetry.
 *
 * @beta
 */
export interface IFluidTelemetry {
	/**
	 * The unique name of the telemetry event. The event name contains scope concatenated together
	 * with periods to enable more granular log searching
	 *
	 * @example
	 * "fluidframework.container.connected"
	 */
	eventName: FluidTelemetryEventName;
}

/**
 * Aggregate type for all the different types of Fluid telemetry event names.
 *
 * @privateremarks This only looks odd right now because {@link ContainerTelemetryEventName} is the only aggregation at the moment.
 *
 * @beta
 */
export type FluidTelemetryEventName = ContainerTelemetryEventName;
