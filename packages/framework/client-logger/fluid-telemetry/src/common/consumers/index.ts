/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IFluidTelemetry } from "../index.js";

/**
 * Base interface for all telemetry consumers.
 * Conusmers are intended to take incoming produced {@link IFluidTelemetry} and do something of your choice with it.
 * This could be sending the telemetry to a cloud platform or just console logging.
 *
 * @see {@link @fluidframework/fluid-telemetry/app-insights#AppInsightsTelemetryConsumer}
 *
 * @beta
 */
export interface ITelemetryConsumer {
	/**
	 * This method is intended to take created {@link IFluidTelemetry} and do something with it.
	 * This could be sending the telemetry to a cloud platform, just console logging or something else of your choice.
	 */
	consume(event: IFluidTelemetry);
}
