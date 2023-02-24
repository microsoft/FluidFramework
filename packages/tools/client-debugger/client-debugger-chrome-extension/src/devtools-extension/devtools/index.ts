/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Devtools Script context label for console logging.
 */
export const devtoolsLoggingContext = "DEVTOOLS";

/**
 * Formats the provided log message with the appropriate context information.
 */
export function formatDevtoolsMessageForLogging(text: string): string {
	return `${devtoolsLoggingContext}: ${text}`;
}
