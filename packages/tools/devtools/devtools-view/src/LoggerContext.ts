/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import React from "react";
import { ITelemetryLoggerExt } from "@fluidframework/telemetry-utils";

/**
 * Context that provides a logger for Devtools to generate usage telemetry internally.
 *
 * @remarks
 * The logger provided through this context is not supposed to be the final handler for the telemetry events it
 * receives; it should only pass them to the logger provided via {@link DevtoolsPanelProps.usageTelemetryLogger | the
 * usageTelemetryLogger prop for DevtoolsPanel} instead (if any).
 */
export const LoggerContext = React.createContext<ITelemetryLoggerExt | undefined>(undefined);

/**
 * Gets the {@link @fluidframework/telemetry-utils#ITelemetryLoggerExt} provided through an {@link LoggerContext}.
 *
 * @returns
 * The logger from the context, or undefined is no logger was provided.
 */
export function useLogger(): ITelemetryLoggerExt | undefined {
	return React.useContext(LoggerContext);
}
