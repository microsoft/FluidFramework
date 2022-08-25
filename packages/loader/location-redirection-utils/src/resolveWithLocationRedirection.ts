/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITelemetryLogger } from "@fluidframework/common-definitions";
import { IRequest } from "@fluidframework/core-interfaces";
import { DriverErrorType, ILocationRedirectionError, IUrlResolver } from "@fluidframework/driver-definitions";

/**
 * Checks if the error is location redirection error.
 * @param error - error whose type is to be determined.
 * @returns - True is the error is location redirection error.
 */
export function isLocationRedirectionError(error: any): error is ILocationRedirectionError {
    return typeof error === "object" && error !== null
        && error.errorType === DriverErrorType.locationRedirection;
}

/**
 * Handles location redirection while fulfilling the loader request.
 * @param api - Callback in which user can wrap the loader.resolve or loader.request call.
 * @param request - request to be resolved.
 * @param urlResolver - resolver used to resolve the url.
 * @returns - Response from the api call.
 */
export async function resolveWithLocationRedirectionHandling<T>(
    api: (request: IRequest) => Promise<T>,
    request: IRequest,
    urlResolver: IUrlResolver,
    logger?: ITelemetryLogger,
): Promise<T> {
    let req: IRequest = request;
    for (;;) {
        try {
            return await api(req);
        } catch (error: any) {
            if (!isLocationRedirectionError(error)) {
                throw error;
            }
            logger?.sendTelemetryEvent({ eventName: "LocationRedirectionError" });
            const resolvedUrl = error.redirectUrl;
            // Generate the new request with new location details from the resolved url.
            const absoluteUrl = await urlResolver.getAbsoluteUrl(
                resolvedUrl,
                "/",
                undefined,
            );
            req = { url: absoluteUrl, headers: req.headers };
        }
    }
}
