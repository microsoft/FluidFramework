/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { MessageLoggingOptions } from "@fluidframework/devtools-core/internal";

/**
 * Background Script context label for logging.
 */
const backgroundScriptLoggingContext = "BACKGROUND";

/**
 * Configuration for console logging.
 */
export const backgroundScriptMessageLoggingOptions: MessageLoggingOptions = {
	context: backgroundScriptLoggingContext,
};

/**
 * Formats the provided log message with the appropriate context information.
 */
export function formatBackgroundScriptMessageForLogging(text: string): string {
	return `${backgroundScriptLoggingContext}: ${text}`;
}
