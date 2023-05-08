/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { MessageLoggingOptions } from "@fluid-experimental/devtools-core";

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
