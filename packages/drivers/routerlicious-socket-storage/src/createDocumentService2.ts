/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IDocumentService, IResolvedUrl } from "@fluidframework/driver-definitions";
import { IErrorTrackingService } from "@fluidframework/protocol-definitions";
import { ICredentials } from "@fluidframework/server-services-client";
import { DocumentService2 } from "./documentService2";
import { DefaultErrorTracking } from "./errorTracking";
import { TokenProvider } from "./tokens";

/**
 * Returns the document service associated with the factory.
 *
 * @deprecated - The createDocumentService of document service factory directly returns
 *  the associated document service.
 */
/* eslint-disable @typescript-eslint/indent */
export const createDocumentService2 = (
    resolvedUrl: IResolvedUrl,
    ordererUrl: string,
    deltaStorageUrl: string,
    gitUrl: string,
    tokenProvider: TokenProvider,
    tenantId: string,
    documentId: string,
    errorTracking: IErrorTrackingService = new DefaultErrorTracking(),
    disableCache = false,
    historianApi = true,
    credentials?: ICredentials): IDocumentService => new DocumentService2(
        resolvedUrl,
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
/* eslint-enable @typescript-eslint/indent */
