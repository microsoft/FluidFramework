/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { serializeError } from "serialize-error";
import { IWebServer } from "@fluidframework/server-services-core";
import { Lumber, Lumberjack } from "@fluidframework/server-services-telemetry";
import { promiseTimeout } from "@fluidframework/server-services-client";
import { Deferred } from "@fluidframework/common-utils";

/**
 * @internal
 */
export async function runnerHttpServerStop(
	server: IWebServer | undefined,
	runningDeferredPromise: Deferred<void> | undefined,
	runnerServerCloseTimeoutMs: number,
	runnerMetric: Lumber,
	caller: string | undefined,
	uncaughtException: any | undefined,
): Promise<void> {
	const runnerMetricProperties = {
		caller,
		runnerServerCloseTimeoutMs,
	};
	try {
		runnerMetric.setProperties(runnerMetricProperties);
		// Close the underlying server and then resolve the runner once closed
		await promiseTimeout(runnerServerCloseTimeoutMs, server?.close() ?? Promise.resolve());
		if (caller === "uncaughtException") {
			runningDeferredPromise?.reject({
				uncaughtException: serializeError(uncaughtException),
			}); // reject the promise so that the runService exits the process with exit(1)
		} else {
			runningDeferredPromise?.resolve();
		}
		if (!runnerMetric.isCompleted()) {
			runnerMetric.success(`${runnerMetric.eventName} stopped`);
		} else {
			Lumberjack.info(`${runnerMetric.eventName} stopped`, runnerMetricProperties);
		}
	} catch (error) {
		if (!runnerMetric.isCompleted()) {
			runnerMetric.error(`${runnerMetric.eventName} encountered an error during stop`, error);
		} else {
			Lumberjack.error(
				`${runnerMetric.eventName} encountered an error during stop`,
				runnerMetricProperties,
				error,
			);
		}
		if (caller === "sigterm") {
			runningDeferredPromise?.resolve();
		} else {
			// uncaughtException
			runningDeferredPromise?.reject({
				forceKill: true,
				uncaughtException: serializeError(uncaughtException),
				runnerStopException: serializeError(error),
			});
		}
		throw error;
	}
}
