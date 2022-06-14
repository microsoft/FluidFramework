/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IRequest } from "@fluidframework/core-interfaces";
import { DriverErrorType, ILocationRedirectionError, IUrlResolver } from "@fluidframework/driver-definitions";

/**
 * Checks if the error is domain move error.
 * @param error - error whose type is to be determined.
 * @returns - True is the error is domain move error.
 */
export function isDomainMoveError(error: any): error is ILocationRedirectionError {
    return typeof error === "object" && error !== null
        && error.errorType === DriverErrorType.locationRedirection;
}

/**
 * Handles odsp domain change handling while fulfilling the loader request.
 * @param api - Callback in which user can wrap the loader.resolve or loader.request call.
 * @param request - request to be resolved.
 * @param urlResolver - resolver used to resolve the url.
 * @returns - Response from the api call.
 */
export async function resolveWithDomainChangeHandling<T>(
    api: (request: IRequest) => Promise<T>,
    request: IRequest,
    urlResolver: IUrlResolver,
): Promise<T> {
    let req: IRequest = request;
    for(;;) {
        try {
            return await api(req);
        } catch(error: any) {
            if (!isDomainMoveError(error)) {
                throw error;
            }
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
