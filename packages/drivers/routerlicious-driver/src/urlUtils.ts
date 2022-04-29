/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IFluidResolvedUrl } from "@fluidframework/driver-definitions";
import URLParse from "url-parse";
import { ISession } from "@fluidframework/server-services-client";

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

export const getDiscoveredFluidResolvedUrl = (resolvedUrl: IFluidResolvedUrl, session: ISession): IFluidResolvedUrl => {
    if (session) {
        const discoveredOrdererUrl = new URLParse(session.ordererUrl);
        const deltaStorageUrl = new URLParse(resolvedUrl.endpoints.deltaStorageUrl);
        deltaStorageUrl.set("host", discoveredOrdererUrl.host);

        const discoveredStorageUrl = new URLParse(session.historianUrl);
        const storageUrl = new URLParse(resolvedUrl.endpoints.storageUrl);
        storageUrl.set("host", discoveredStorageUrl.host);

        const parsedUrl = parseFluidUrl(resolvedUrl.url);
        const discoveredResolvedUrl: IFluidResolvedUrl = {
            endpoints: {
                deltaStorageUrl: deltaStorageUrl.toString(),
                ordererUrl: session.ordererUrl,
                storageUrl: storageUrl.toString(),
            },
            id: resolvedUrl.id,
            tokens: resolvedUrl.tokens,
            type: resolvedUrl.type,
            url: new URLParse(`fluid://${discoveredOrdererUrl.host}${parsedUrl.pathname}`).toString(),
        };

        return discoveredResolvedUrl;
    } else {
        return resolvedUrl;
    }
};
