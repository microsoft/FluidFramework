import { IDocumentService, IErrorTrackingService } from "@prague/container-definitions";
import { ICredentials } from "@prague/services-client";
import { DocumentService2 } from "./documentService2";
import { DefaultErrorTracking } from "./errorTracking";

export function createDocumentService2(
    ordererUrl: string,
    deltaStorageUrl: string,
    gitUrl: string,
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
        credentials);
}
