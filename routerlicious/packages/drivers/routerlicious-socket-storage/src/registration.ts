import { IDocumentService, IErrorTrackingService } from "@prague/container-definitions";
import { IGitCache } from "@prague/services-client";
import { DocumentService } from "./documentService";
import { DefaultErrorTracking } from "./errorTracking";
import { TokenProvider } from "./tokens";

export function createDocumentService(
    ordererUrl: string,
    deltaStorageUrl: string,
    gitUrl: string,
    tokenProvider: TokenProvider,
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
        tokenProvider);

    return service;
}
