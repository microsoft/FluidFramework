/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Converts a Fluid URL string (e.g. `fluid://host.com/tenant/document`) into a URL object.
 * The browser API for URL does not treat `fluid:` as a valid protocol, so we replace it with http here.
 * IMPORTANT: When converting back to a full URL string, use `stringifyAsFluidUrl` from this package.
 */
export const parseFluidUrl = (fluidUrl: string): URL => {
    return new URL(fluidUrl.replace(/^fluid:/, "https:"));
};

/**
 * Converts a URL object to a Fluid URL string by replacing `http:` or `https:` protocol with `fluid:`.
 * The browser API for URL does not treat `fluid:` as a valid protocol, so we replace it after stringifying the URL.
 */
export const stringifyAsFluidUrl = (url: URL): string => {
    return url.toString().replace(/^https?:/, "fluid:");
};

/**
 * Assume documentId is at end of url path.
 * This is true for Routerlicious' and Tinylicious' documentUrl and deltaStorageUrl.
 * Routerlicious and Tinylicious do not use documentId in storageUrl nor ordererUrl.
 * TODO: Ideally we would be able to regenerate the resolvedUrl, rather than patching the current one.
 */
export const replaceDocumentIdInPath = (urlPath: string, documentId: string): string =>
    urlPath.split("/").slice(0, -1).concat([documentId]).join("/");
