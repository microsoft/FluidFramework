/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IDocumentService, IErrorTrackingService } from "@prague/container-definitions";
import { IGitCache } from "@prague/services-client";
import { DocumentService } from "./documentService";
import { DefaultErrorTracking } from "./errorTracking";
import { TokenProvider } from "./tokens";

/**
 * Returns the document service associated with the factory.
 *
 * @deprecated - The createDocumentService of document service factory directly returns
 *  the associated document service.
 */
export function createDocumentService(
    ordererUrl: string,
    deltaStorageUrl: string,
    gitUrl: string,
    tokenProvider: TokenProvider,
    tenantId: string,
    documentId: string,
    errorTracking: IErrorTrackingService = new DefaultErrorTracking(),
    disableCache = false,
    historianApi = true,
    credentials?,
    seedData?: IGitCache): IDocumentService {

    /* tslint:disable:no-unsafe-any */
    const service = new DocumentService(
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
