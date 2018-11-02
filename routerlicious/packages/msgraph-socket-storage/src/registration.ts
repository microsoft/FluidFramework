import * as api from "@prague/client-api";
import * as resources from "@prague/gitresources";
import { IDocumentService, IErrorTrackingService, ITokenProvider, IUser } from "@prague/runtime-definitions";
import { ICredentials } from "@prague/services-client";
import * as socketStorage from "@prague/socket-storage";
import { SharepointDocumentService } from "./sharepointDocumentService";

export interface IRouterliciousServiceRegistration {
    deltaUrl: string;
    gitUrl: string;
    errorTracking?: IErrorTrackingService;
    disableCache?: boolean;
    historianApi?: boolean;
    credentials?: ICredentials;
    tokenProvider: ITokenProvider;
}

export interface ISpoServiceRegistration {
    snapshotUrl: string;
    deltaFeedUrl: string;
    webSocketUrl: string;
    tokenProvider: ITokenProvider;
}

// TODO: This is a temporary API while we build transition from using routerlicious
// to the actual SPO Prague endpoints. Once we have validated that the SPO
// endpoints work, the callers should be using the load API.
export function loadSPODocument(
    id: string,
    tenantId: string,
    user: IUser,
    useRouterliciousEndpoint: false,
    routerliciousServiceRegistration: IRouterliciousServiceRegistration,
    serviceRegistration: ISpoServiceRegistration,
    options: any = {},
    version: resources.ICommit = null,
    connect = true): Promise<api.Document> {
    if (useRouterliciousEndpoint) {
        const documentService = socketStorage.createDocumentService(
            routerliciousServiceRegistration.deltaUrl,
            routerliciousServiceRegistration.gitUrl,
            routerliciousServiceRegistration.errorTracking,
            routerliciousServiceRegistration.disableCache,
            routerliciousServiceRegistration.historianApi,
            routerliciousServiceRegistration.credentials);
        return api.load(
            id,
            tenantId,
            user,
            routerliciousServiceRegistration.tokenProvider,
            options,
            version,
            connect,
            documentService);
    } else {
        return load(
            id,
            tenantId,
            user,
            serviceRegistration.snapshotUrl,
            serviceRegistration.deltaFeedUrl,
            serviceRegistration.webSocketUrl,
            serviceRegistration.tokenProvider,
            options,
            version,
            connect);
    }
}

export function load(
    id: string,
    tenantId: string,
    user: IUser,
    snapshotUrl: string,
    deltaFeedUrl: string,
    webSocketUrl: string,
    tokenProvider: ITokenProvider,
    options: any = {},
    version: resources.ICommit = null,
    connect = true): Promise<api.Document> {
    const documentService: IDocumentService = createSharepointDocumentService(
        snapshotUrl,
        deltaFeedUrl,
        webSocketUrl);
    return api.load(id, tenantId, user, tokenProvider, options, version, connect, documentService);
}

function createSharepointDocumentService(
    snapshotUrl: string,
    deltaFeedUrl: string,
    webSocketUrl: string,
    ): IDocumentService {

    const service = new SharepointDocumentService(
        snapshotUrl,
        deltaFeedUrl,
        webSocketUrl);

    return service;
}
