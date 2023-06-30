/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { MessageLoggingOptions } from "@fluid-experimental/devtools-core";
import { ITelemetryBaseEvent, ITelemetryBaseLogger } from "@fluid-experimental/devtools-view";

/**
 * Devtools Script context label for console logging.
 */
const devtoolsScriptLoggingContext = "DEVTOOLS";

/**
 * Content Script configuration for console logging.
 */
export const devtoolsScriptMessageLoggingOptions: MessageLoggingOptions = {
	context: devtoolsScriptLoggingContext,
};

/**
 * Formats the provided log message with the appropriate context information.
 */
export function formatDevtoolsScriptMessageForLogging(text: string): string {
	return `${devtoolsScriptLoggingContext}: ${text}`;
}

/**
 * Logger that writes any events it receives to the browser console and forwards them to a base logger.
 *
 * @remarks
 * Inside the extension, the console where these events are displayed is not the same one that displays messages from
 * the current tab. The extension's console can be accessed by right-clicking somewhere on the rendered extension
 * in the brower's devtools panel, selecting "Inspect", and switching to the Console tab.
 */
export class ConsoleLogger implements ITelemetryBaseLogger {

	public constructor(private readonly baseLogger?: ITelemetryBaseLogger) { }

	public send(event: ITelemetryBaseEvent): void {
		console.log(JSON.stringify(event));
		this.baseLogger?.send(event);
	}
}
