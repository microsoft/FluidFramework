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

export const createFluidUrl = (domain: string, pathname: string): string =>
    "fluid://".concat(domain, pathname);

export const replaceWithDiscoveryUrl = (resolvedUrl: IFluidResolvedUrl,
    session: ISession,
    parsedUrl: URLParse): void => {
    if (session && session.ordererUrl.includes("https")) {
        const replaceOrderUrl = new URL(session.ordererUrl);
        const deltaStorageUrl = new URL(resolvedUrl.endpoints.deltaStorageUrl);
        deltaStorageUrl.host = replaceOrderUrl.host;
        resolvedUrl.endpoints.deltaStorageUrl = deltaStorageUrl.toString();

        const replaceHistorianUrl = new URL(session.historianUrl);
        const storageUrl = new URL(resolvedUrl.endpoints.storageUrl);
        storageUrl.host = replaceHistorianUrl.host;
        resolvedUrl.endpoints.storageUrl = storageUrl.toString();

        resolvedUrl.url = createFluidUrl(session.ordererUrl.replace(/^https?:\/\//, ""), parsedUrl.pathname);
        resolvedUrl.endpoints.ordererUrl = session.ordererUrl;
    }
};
