/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITelemetryLoggerExt } from "@fluidframework/telemetry-utils";
import { delay, performance } from "@fluidframework/common-utils";
import { canRetryOnError, getRetryDelayFromError } from "@fluidframework/driver-utils";
import { OdspErrorType } from "@fluidframework/odsp-driver-definitions";
import { Odsp409Error } from "./epochTracker";

/**
 * This method retries only for retriable coherency and service read only errors.
 */
export async function runWithRetry<T>(
	api: () => Promise<T>,
	callName: string,
	logger: ITelemetryLoggerExt,
	checkDisposed?: () => void,
): Promise<T> {
	let retryAfter = 1000;
	const start = performance.now();
	let lastError: any;
	for (let attempts = 1; ; attempts++) {
		if (checkDisposed !== undefined) {
			checkDisposed();
		}
		try {
			const result = await api();
			if (attempts > 1) {
				logger.sendTelemetryEvent(
					{
						eventName: "MultipleRetries",
						callName,
						attempts,
						duration: performance.now() - start,
					},
					lastError,
				);
			}
			return result;
		} catch (error: any) {
			const canRetry = canRetryOnError(error);

			const coherencyError = error?.[Odsp409Error] === true;
			const serviceReadonlyError = error?.errorType === OdspErrorType.serviceReadOnly;

			// logging the first failed retry instead of every attempt. We want to avoid filling telemetry
			// when we have tight loop of retrying in offline mode, but we also want to know what caused
			// the failure in the first place
			if (attempts === 1) {
				logger.sendTelemetryEvent(
					{
						eventName: `${callName}_firstFailed`,
						callName,
						attempts,
						duration: performance.now() - start, // record total wait time.
					},
					error,
				);
			}

			// Retry for retriable 409 coherency errors or serviceReadOnly errors. These errors are always retriable
			// unless someone specifically set canRetry = false on the error like in fetchSnapshot() flow. So in
			// that case don't retry.
			if (!((coherencyError || serviceReadonlyError) && canRetry)) {
				throw error;
			}

			// SPO itself does number of retries internally before returning 409 to client.
			// That multiplied to 5 suggests need to reconsider current design, as client spends
			// too much time / bandwidth doing the same thing without any progress.
			if (attempts === 5) {
				logger.sendErrorEvent(
					{
						eventName: coherencyError
							? "CoherencyErrorTooManyRetries"
							: "ServiceReadonlyErrorTooManyRetries",
						callName,
						attempts,
						duration: performance.now() - start, // record total wait time.
					},
					error,
				);
				// Fail hard.
				error.canRetry = false;
				throw error;
			}

			retryAfter = getRetryDelayFromError(error) ?? retryAfter;
			await delay(Math.floor(retryAfter));
			retryAfter += (retryAfter / 4) * (1 + Math.random());
			lastError = error;
		}
	}
}
