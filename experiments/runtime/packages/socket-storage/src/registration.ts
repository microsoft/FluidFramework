import { IDocumentService } from "@prague/loader";
import { DocumentService } from "./documentService";

export function createDocumentService(
    deltaUrl: string,
    gitUrl: string,
    errorTracking = true,
    disableCache = false,
    historianApi = true,
    credentials?): IDocumentService {

    const service = new DocumentService(
        deltaUrl,
        gitUrl,
        errorTracking,
        disableCache,
        historianApi,
        credentials);

    return service;
}
