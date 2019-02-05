import { IDocumentService, IErrorTrackingService } from "@prague/container-definitions";
import { DocumentService } from "./documentService";
import { DefaultErrorTracking } from "./errorTracking";

export function createDocumentService(
    deltaUrl: string,
    gitUrl: string,
    errorTracking: IErrorTrackingService = new DefaultErrorTracking(),
    disableCache = false,
    historianApi = true,
    credentials?): IDocumentService {

    /* tslint:disable:no-unsafe-any */
    const service = new DocumentService(
        deltaUrl,
        gitUrl,
        errorTracking,
        disableCache,
        historianApi,
        credentials);

    return service;
}
