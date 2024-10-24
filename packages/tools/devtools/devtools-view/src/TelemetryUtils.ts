/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type {
	ITelemetryBaseEvent,
	ITelemetryBaseLogger,
} from "@fluidframework/core-interfaces";
import type { ITelemetryLoggerExt } from "@fluidframework/telemetry-utils/internal";
import React from "react";

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
		// verbosity level is set to "Verbose".
		console.debug(`USAGE_TELEMETRY: ${JSON.stringify(event)}`);
		this.baseLogger?.send(event);
	}
}

/**
 * Key for the local storage entry that stores the usage telemetry opt-in setting.
 */
const telemetryOptInKey: string = "fluid:devtools:telemetry:optIn";

/**
 * Callback function that indicates if the user has opted in to report telemetry
 * @returns boolean representing whether telemetry collection is enabled
 * @internal
 */
export const isTelemetryOptInEnabled = (): boolean => getStorageValue(telemetryOptInKey);

/**
 * Hook for getting and setting the usage telemetry opt-in setting, backed by brower's local storage.
 * @returns A tuple (React state) with the current value and a setter for the value.
 */
export const useTelemetryOptIn = (): [
	boolean,
	React.Dispatch<React.SetStateAction<boolean>>,
] => {
	const [value, setValue] = React.useState(() => {
		return getStorageValue(telemetryOptInKey);
	});

	React.useEffect(() => {
		localStorage.setItem(telemetryOptInKey, value.toString());
	}, [value]);

	const localStorageChangeHandler = (event: StorageEvent): void => {
		if (event.storageArea === localStorage && event.key === telemetryOptInKey) {
			setValue(event.newValue === "true");
		}
	};
	React.useEffect(() => {
		window.addEventListener("storage", localStorageChangeHandler);
		return (): void => {
			window.removeEventListener("storage", localStorageChangeHandler);
		};
	});

	return [value, setValue];
};

/**
 * Logger that forwards events to another logger only when the setting to opt-in to usage telemetry is enabled.
 */
export class TelemetryOptInLogger implements ITelemetryBaseLogger {
	public constructor(private readonly baseLogger?: ITelemetryBaseLogger) {}

	public send(event: ITelemetryBaseEvent): void {
		const optIn = getStorageValue(telemetryOptInKey);
		if (optIn === true) {
			this.baseLogger?.send(event);
		}
	}
}

function getStorageValue(key: string, defaultValue: boolean = false): boolean {
	const saved = localStorage.getItem(key);
	if (saved === null) {
		return defaultValue;
	}
	return saved === "true";
}
