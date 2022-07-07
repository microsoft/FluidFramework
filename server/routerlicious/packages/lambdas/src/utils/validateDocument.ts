/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IDocument, IServiceConfiguration } from "@fluidframework/server-services-core";

/**
 * Whether a document exists and is not functionally deleted.
 */
export function isDocumentValid(document: IDocument): boolean {
    return !!document && document.scheduledDeletionTime !== undefined;
}

/**
 * Whether a document's active session aligns with the service's location.
 */
export function isDocumentSessionValid(document: IDocument, serviceConfiguration: IServiceConfiguration): boolean {
    if (!serviceConfiguration.externalOrdererUrl || !document.session) {
        // No session or location to validate.
        return true;
    }
    return document.session.ordererUrl === serviceConfiguration.externalOrdererUrl;
}
