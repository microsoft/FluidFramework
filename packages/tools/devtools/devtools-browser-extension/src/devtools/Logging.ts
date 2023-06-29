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
 * Logger that can be passed to the extension via a {@link @fluid-experimental/devtools-view#LoggerContext} to display
 * usage telemetry events from the extension with alert popups in the browser.
 *
 * @remarks
 * Only intended for testing the extension during development. Since the extension runs in a separate context than the
 * current browser tab, console.log() does not display the messages anywhere we can use them for troubleshooting.
 * The current workaround is to use alert() to display them.
 */
export const alertTelemetryLogger: ITelemetryBaseLogger = {
	send: (event: ITelemetryBaseEvent) => {
		alert(JSON.stringify(event));
	},
};
