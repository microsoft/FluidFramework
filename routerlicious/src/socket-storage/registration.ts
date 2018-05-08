import * as socketStorage from ".";
import * as api from "../api";
import { IDocumentService } from "../api-core";

export function createDocumentService(
    deltaUrl: string,
    gitUrl: string,
    tenantId: string,
    disableCache = false,
    historianApi = true,
    credentials?): IDocumentService {

    const service = new socketStorage.DocumentService(
        deltaUrl,
        gitUrl,
        disableCache,
        historianApi,
        credentials);

    return service;
}

export function registerAsDefault(
    deltaUrl: string,
    gitUrl: string,
    tenantId: string,
    disableCache = false,
    historianApi = true,
    credentials?) {

    const service = createDocumentService(
        deltaUrl,
        gitUrl,
        tenantId,
        disableCache,
        historianApi,
        credentials);
    api.registerDocumentService(service);
}
