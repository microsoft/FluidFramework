/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IRequest } from "@fluidframework/core-interfaces";
import { IUrlResolver } from "@fluidframework/driver-definitions";
import { IOdspResolvedUrl, OdspErrorType } from "@fluidframework/odsp-driver-definitions";

/**
 * Checks if the error is domain move error.
 * @param error - error whose type is to be determined.
 * @returns - True is the error is domain move error.
 */
export function isDomainMoveError(error: any) {
    if (typeof error === "object" && error !== null
        && error.errorType === OdspErrorType.locationRedirection) {
        return true;
    }
    return false;
}

/**
 * 
 * @param api - Callback in which user can wrap the loader.resolve or loader.request call.
 * @param request - request to be resolved.
 * @param urlResolver - resolver used to resolve the url.
 * @returns 
 */
export async function resolveWithDomainChangeHandling<T>(
    api: (request: IRequest) => Promise<T>,
    request: IRequest,
    urlResolver: IUrlResolver,
): Promise<T> {
    let req: IRequest = request;
    let success = false;
    let response: T | undefined;
    do {
        try {
            response = await api(req);
            success = true;
        } catch(error: any) {
            if (isDomainMoveError(error)) {
                const odspResolvedUrl = await urlResolver.resolve(req) as IOdspResolvedUrl;
                // Generate the new Url from the 
                const newSiteDomain = new URL(error.redirectLocation).origin;
                const newSiteUrl = `${newSiteDomain}${new URL(odspResolvedUrl.siteUrl).pathname}`;
                odspResolvedUrl.siteUrl = newSiteUrl;
                const absoluteUrl = await urlResolver.getAbsoluteUrl(
                    odspResolvedUrl,
                    "/",
                    undefined,
                );
                req = { url: absoluteUrl, headers: req.headers };
            } else {
                throw error;
            }
        }
    } while(!success);
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    return response!;
}
