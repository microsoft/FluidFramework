/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ITelemetryLoggerExt } from "@fluidframework/telemetry-utils/internal";

export async function useCreateNewModule<T = void>(
	odspLogger: ITelemetryLoggerExt,
	func: (
		// eslint-disable-next-line @typescript-eslint/consistent-type-imports
		m: typeof import("./createNewModule.js") /* webpackChunkName: "createNewModule" */,
	) => Promise<T>,
): Promise<T> {
	// We can delay load this module as this path will not be executed in load flows and create flow
	// while only happens once in lifetime of a document which happens in the background after creation of
	// detached container.

	const maxRetries = 3;
	const retryDelayMs = 50; // 50ms delay between retries

	for (let attempt = 1; attempt <= maxRetries; attempt++) {
		try {
			// Add delay before retry attempts (not on first attempt)
			if (attempt > 1) {
				await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
			}

			// Import the module
			const module = await import(
				/* webpackChunkName: "createNewModule" */ "./createNewModule.js"
			);
			odspLogger.sendTelemetryEvent({ eventName: "createNewModuleLoaded", attempt });

			// Execute the function with the successfully imported module
			// Business logic errors will propagate naturally without retry
			return await func(module);
		} catch (error) {
			if (attempt < maxRetries) {
				odspLogger.sendTelemetryEvent(
					{
						eventName: "createNewModuleImportRetry",
						attempt,
						maxRetries,
					},
					error,
				);
			} else {
				// Final attempt failed
				odspLogger.sendErrorEvent(
					{
						eventName: "createNewModuleLoadFailed",
						attempt,
						maxRetries,
					},
					error,
				);
				throw error;
			}
		}
	}

	// This should never be reached, but TypeScript needs it for type safety
	throw new Error("Module import failed after all retry attempts");
}
