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
 * receives; it should only pass them to the logger provided by the {@link LoggerContext} instead (if any).
 */
export const InternalLoggerContext = React.createContext<ITelemetryLoggerExt | undefined>(
	undefined,
);

/**
 * Gets the {@link @fluidframework/telemetry-utils#ITelemetryLoggerExt} provided through an {@link InternalLoggerContext}.
 *
 * @returns
 * The logger from the context, or undefined is no logger was provided.
 */
export function useLogger(): ITelemetryLoggerExt | undefined {
	return React.useContext(InternalLoggerContext);
}
