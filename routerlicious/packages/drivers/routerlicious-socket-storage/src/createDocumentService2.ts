import { IDocumentService, IErrorTrackingService } from "@prague/container-definitions";
import { ICredentials } from "@prague/services-client";
import { DocumentService2 } from "./documentService2";
import { DefaultErrorTracking } from "./errorTracking";
import { TokenProvider } from "./tokens";

export function createDocumentService2(
    ordererUrl: string,
    deltaStorageUrl: string,
    gitUrl: string,
    tokenProvider: TokenProvider,
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
        tokenProvider);
}
