/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { performanceNow } from "@fluid-internal/client-utils";
import { delay } from "@fluidframework/core-utils/internal";
import {
	canRetryOnError,
	getRetryDelayFromError,
} from "@fluidframework/driver-utils/internal";
import { OdspErrorTypes } from "@fluidframework/odsp-driver-definitions/internal";
import { ITelemetryLoggerExt } from "@fluidframework/telemetry-utils/internal";

import { Odsp409Error } from "./epochTracker.js";

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
	const start = performanceNow();
	let lastError: unknown;
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
						duration: performanceNow() - start,
					},
					lastError,
				);
			}
			return result;
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
		} catch (error: any) {
			const canRetry = canRetryOnError(error);

			// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
			const coherencyError = error?.[Odsp409Error] === true;
			// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
			const serviceReadonlyError = error?.errorType === OdspErrorTypes.serviceReadOnly;

			// logging the first failed retry instead of every attempt. We want to avoid filling telemetry
			// when we have tight loop of retrying in offline mode, but we also want to know what caused
			// the failure in the first place
			if (attempts === 1) {
				logger.sendTelemetryEvent(
					{
						eventName: `${callName}_firstFailed`,
						callName,
						attempts,
						duration: performanceNow() - start, // record total wait time.
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
						duration: performanceNow() - start, // record total wait time.
					},
					error,
				);
				// Fail hard.
				// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
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
