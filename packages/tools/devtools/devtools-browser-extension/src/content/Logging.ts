/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { MessageLoggingOptions } from "@fluidframework/devtools-core/internal";

/**
 * Content Script context label for console logging.
 */
const contentScriptLoggingContext = "CONTENT";

/**
 * Content Script configuration for console logging.
 */
export const contentScriptMessageLoggingOptions: MessageLoggingOptions = {
	context: contentScriptLoggingContext,
};

/**
 * Formats the provided log message with the appropriate context information.
 */
export function formatContentScriptMessageForLogging(text: string): string {
	return `${contentScriptLoggingContext}: ${text}`;
}
