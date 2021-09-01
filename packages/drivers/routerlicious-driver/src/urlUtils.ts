/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import URLParse from "url-parse";

export const parseFluidUrl = (fluidUrl: string): URLParse => {
    return new URLParse(fluidUrl);
};

/**
 * Assume documentId is at end of url path.
 * This is true for Routerlicious' and Tinylicious' documentUrl and deltaStorageUrl.
 * Routerlicious and Tinylicious do not use documentId in storageUrl nor ordererUrl.
 * TODO: Ideally we would be able to regenerate the resolvedUrl, rather than patching the current one.
 */
export const replaceDocumentIdInPath = (urlPath: string, documentId: string): string =>
    urlPath.split("/").slice(0, -1).concat([documentId]).join("/");
