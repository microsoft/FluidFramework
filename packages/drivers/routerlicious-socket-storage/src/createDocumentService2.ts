/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IDocumentService, IErrorTrackingService } from "@prague/container-definitions";
import { ICredentials } from "@prague/services-client";
import { DocumentService2 } from "./documentService2";
import { DefaultErrorTracking } from "./errorTracking";
import { TokenProvider } from "./tokens";

/**
 * Returns the document service associated with the factory.
 *
 * @deprecated - The createDocumentService of document service factory directly returns
 *  the associated document service.
 */
export function createDocumentService2(
    ordererUrl: string,
    deltaStorageUrl: string,
    gitUrl: string,
    tokenProvider: TokenProvider,
    tenantId: string,
    documentId: string,
    errorTracking: IErrorTrackingService = new DefaultErrorTracking(),
    disableCache = false,
    historianApi = true,
    credentials?: ICredentials): IDocumentService {
    return new DocumentService2(
        ordererUrl,
        deltaStorageUrl,
        gitUrl,
        errorTracking,
        disableCache,
        historianApi,
        credentials,
        tokenProvider,
        tenantId,
        documentId);
}
