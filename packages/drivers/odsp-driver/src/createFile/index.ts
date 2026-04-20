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
	const retryDelayMs = 50; // 50 ms delay between retries
	// eslint-disable-next-line @typescript-eslint/consistent-type-imports
	let module: typeof import("./createNewModule.js") | undefined;
	let lastError: unknown;

	for (let attempt = 1; attempt <= maxRetries; attempt++) {
		// Add delay before retry attempts (not on first attempt)
		if (attempt > 1) {
			await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
		}
		module = await import(/* webpackChunkName: "createNewModule" */ "./createNewModule.js")
			.then((m) => {
				odspLogger.sendTelemetryEvent({ eventName: "createNewModuleLoaded", attempt });
				return m;
			})
			.catch((error) => {
				lastError = error;
				odspLogger.sendTelemetryEvent(
					{
						eventName: "createNewModuleImportRetry",
						attempt,
						maxRetries,
					},
					error,
				);
				return undefined;
			});
		// If successfully loaded the module, break out of the loop and use it
		if (module) {
			break;
		}
	}

	if (!module) {
		// Final attempt failed
		odspLogger.sendErrorEvent(
			{
				eventName: "createNewModuleLoadFailed",
				maxRetries,
			},
			lastError,
		);
		throw lastError;
	}

	return func(module);
}
