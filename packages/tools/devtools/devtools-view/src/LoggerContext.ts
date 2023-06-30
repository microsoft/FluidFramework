/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import React from "react";
import { ITelemetryLoggerExt } from "@fluidframework/telemetry-utils";
import { ITelemetryBaseEvent, ITelemetryBaseLogger } from "@fluidframework/common-definitions";

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

/**
 * Logger that writes any events it receives to the browser console and forwards them to a base logger.
 *
 * @remarks
 * The events are visible in the console when its verbosity level is set to "Verbose".
 *
 * @remarks
 * Inside the extension, the console where these events are displayed is not the same one that displays messages from
 * the current tab. The extension's console can be accessed by right-clicking somewhere on the rendered extension
 * in the brower's devtools panel, selecting "Inspect", and switching to the Console tab.
 */
export class ConsoleVerboseLogger implements ITelemetryBaseLogger {
	public constructor(private readonly baseLogger?: ITelemetryBaseLogger) {}

	public send(event: ITelemetryBaseEvent): void {
		// Deliberately using console.debug() instead of console.log() so the events are only shown when the console's
		// verobsity level is set to "Verbose".
		console.debug(JSON.stringify(event));
		this.baseLogger?.send(event);
	}
}
