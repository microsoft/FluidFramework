/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IDocumentService, IResolvedUrl } from "@fluidframework/driver-definitions";
import { IErrorTrackingService } from "@fluidframework/protocol-definitions";
import { IGitCache } from "@fluidframework/server-services-client";
import { DocumentService } from "./documentService";
import { DefaultErrorTracking } from "./errorTracking";
import { ITokenProvider } from "./tokens";

/**
 * Returns the document service associated with the factory.
 *
 * @deprecated - The createDocumentService of document service factory directly returns
 *  the associated document service.
 */
export function createDocumentService(
    resolvedUrl: IResolvedUrl,
    ordererUrl: string,
    deltaStorageUrl: string,
    gitUrl: string,
    tokenProvider: ITokenProvider,
    tenantId: string,
    documentId: string,
    errorTracking: IErrorTrackingService = new DefaultErrorTracking(),
    disableCache = false,
    historianApi = true,
    credentials?,
    seedData?: IGitCache): IDocumentService {
    const service = new DocumentService(
        resolvedUrl,
        ordererUrl,
        deltaStorageUrl,
        gitUrl,
        errorTracking,
        disableCache,
        historianApi,
        credentials,
        seedData,
        tokenProvider,
        tenantId,
        documentId);

    return service;
}
