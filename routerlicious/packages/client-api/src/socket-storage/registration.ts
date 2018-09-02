import * as socketStorage from ".";
import * as api from "../api";
import { IDocumentService, IErrorTrackingService } from "../api-core";
import { DefaultErrorTracking } from "./errorTracking";

export function createDocumentService(
    deltaUrl: string,
    gitUrl: string,
    tenantId: string,
    errorTracking: IErrorTrackingService = new DefaultErrorTracking(),
    disableCache = false,
    historianApi = true,
    credentials?): IDocumentService {

    const service = new socketStorage.DocumentService(
        deltaUrl,
        gitUrl,
        errorTracking,
        disableCache,
        historianApi,
        credentials);

    return service;
}

export function registerAsDefault(
    deltaUrl: string,
    gitUrl: string,
    tenantId: string,
    errorTracking: IErrorTrackingService = new DefaultErrorTracking(),
    disableCache = false,
    historianApi = true,
    credentials?) {

    const service = createDocumentService(
        deltaUrl,
        gitUrl,
        tenantId,
        errorTracking,
        disableCache,
        historianApi,
        credentials);
    api.registerDocumentService(service);
}
