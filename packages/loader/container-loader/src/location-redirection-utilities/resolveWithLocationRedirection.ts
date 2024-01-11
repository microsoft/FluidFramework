/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITelemetryBaseLogger, IRequest } from "@fluidframework/core-interfaces";
import {
	DriverErrorTypes,
	ILocationRedirectionError,
	IUrlResolver,
} from "@fluidframework/driver-definitions";
import { createChildLogger } from "@fluidframework/telemetry-utils";

/**
 * Checks if the error is location redirection error.
 * @param error - error whose type is to be determined.
 * @returns `true` is the error is location redirection error, otherwise `false`.
 * @internal
 */
export function isLocationRedirectionError(error: any): error is ILocationRedirectionError {
	return (
		typeof error === "object" &&
		error !== null &&
		error.errorType === DriverErrorTypes.locationRedirection
	);
}

/**
 * Handles location redirection while fulfilling the loader request.
 * @param api - Callback in which user can wrap the loader.resolve or loader.request call.
 * @param request - request to be resolved.
 * @param urlResolver - resolver used to resolve the url.
 * @param logger - logger to send events.
 * @returns Response from the API call.
 * @alpha
 */
export async function resolveWithLocationRedirectionHandling<T>(
	api: (request: IRequest) => Promise<T>,
	request: IRequest,
	urlResolver: IUrlResolver,
	logger?: ITelemetryBaseLogger,
): Promise<T> {
	let req: IRequest = request;
	const childLogger = createChildLogger({ logger, namespace: "LocationRedirection" });
	for (;;) {
		try {
			return await api(req);
		} catch (error: any) {
			if (!isLocationRedirectionError(error)) {
				throw error;
			}
			childLogger.sendTelemetryEvent({ eventName: "LocationRedirectionError" });
			const resolvedUrl = error.redirectUrl;
			// Generate the new request with new location details from the resolved url. For datastore/relative path,
			// we don't need to pass "/" as host could have asked for a specific data store. So driver need to
			// extract it from the resolved url.
			const absoluteUrl = await urlResolver.getAbsoluteUrl(resolvedUrl, "", undefined);
			req = { url: absoluteUrl, headers: req.headers };
		}
	}
}
