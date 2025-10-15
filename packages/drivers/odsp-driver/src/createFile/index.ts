/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { delay } from "@fluidframework/core-utils/internal";
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
	const timeoutMs = 100; // 100ms
	let lastError: Error;

	for (let attempt = 1; attempt <= maxRetries; attempt++) {
		try {
			// Create timeout promise
			const timeoutPromise = new Promise<never>((_resolve, reject) => {
				setTimeout(
					() => reject(new Error(`Import timed out after ${timeoutMs}ms`)),
					timeoutMs,
				);
			});

			// Race the import against the timeout
			const module = await Promise.race([
				import(/* webpackChunkName: "createNewModule" */ "./createNewModule.js"),
				timeoutPromise,
			]).then((m) => {
				odspLogger.sendTelemetryEvent({ eventName: "createNewModuleLoaded", attempt });
				return m;
			});

			return await func(module);
		} catch (error) {
			odspLogger.sendTelemetryEvent({
				eventName: "createNewModuleImportRetry",
				attempt,
				maxRetries,
				error: (error as Error).message,
			});

			if (attempt === maxRetries) {
				odspLogger.sendErrorEvent({ eventName: "createNewModuleLoadFailed" }, error);
				throw error;
			}

			// Exponential backoff: 100ms, 200ms, 400ms
			const delayMs = 100 * Math.pow(2, attempt - 1);
			await delay(delayMs);
		}
	}

	// This should never be reached due to the throw in the loop, but TypeScript needs it
	throw lastError!;
}
