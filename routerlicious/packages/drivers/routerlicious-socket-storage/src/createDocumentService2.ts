import { IDocumentService, IErrorTrackingService } from "@prague/container-definitions";
import { DocumentService2 } from "./documentService2";
import { DefaultErrorTracking } from "./errorTracking";

export function createDocumentService2(
    deltaUrl: string,
    tenantId: string,
    documentId: string,
    gitUrl: string, errorTracking: IErrorTrackingService = new DefaultErrorTracking(),
    disableCache = false,
    historianApi = true, credentials?): IDocumentService {
    /* tslint:disable:no-unsafe-any */
    const service = new DocumentService2(
        deltaUrl,
        gitUrl,
        errorTracking,
        disableCache,
        historianApi,
        credentials,
        tenantId,
        documentId);
    return service;
}
