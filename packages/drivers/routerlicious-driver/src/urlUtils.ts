/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IFluidResolvedUrl } from "@fluidframework/driver-definitions";
import URLParse from "url-parse";
import { ISession } from "./contracts";

export const parseFluidUrl = (fluidUrl: string): URLParse => {
    return new URLParse(fluidUrl, true);
};

/**
 * Assume documentId is at end of url path.
 * This is true for Routerlicious' and Tinylicious' documentUrl and deltaStorageUrl.
 * Routerlicious and Tinylicious do not use documentId in storageUrl nor ordererUrl.
 * TODO: Ideally we would be able to regenerate the resolvedUrl, rather than patching the current one.
 */
export const replaceDocumentIdInPath = (urlPath: string, documentId: string): string =>
    urlPath.split("/").slice(0, -1).concat([documentId]).join("/");

export const replaceDomainInPath = (domain: string, domainReplaced: string, url: string): string => {
    return url.replace(domainReplaced, domain);
};

export const createFluidUrl = (domain: string, pathname: string): string =>
        "fluid://".concat(domain).concat(pathname);

export const replaceFluidUrl = (resolvedUrl: IFluidResolvedUrl, session: ISession, parsedUrl: URLParse): void => {
    if (session.ordererUrl.includes("alfred")) {
        resolvedUrl.url = createFluidUrl(session.ordererUrl, parsedUrl.pathname);
        resolvedUrl.endpoints.ordererUrl = replaceDomainInPath(session.ordererUrl, parsedUrl.host,
                                                                resolvedUrl.endpoints.ordererUrl);
        resolvedUrl.endpoints.deltaStorageUrl = replaceDomainInPath(session.ordererUrl, parsedUrl.host,
                                                                    resolvedUrl.endpoints.deltaStorageUrl);
        resolvedUrl.endpoints.storageUrl = replaceDomainInPath(session.historianUrl, parsedUrl.host,
                                                                resolvedUrl.endpoints.storageUrl);
    }
};
