import * as api from "@prague/client-api";
import * as resources from "@prague/gitresources";
import { IDocumentService, ITokenProvider, IUser } from "@prague/runtime-definitions";
import { SharepointDocumentService } from "./sharepointDocumentService";

export function load(
    snapshotUrl: string,
    deltaFeedUrl: string,
    webSocketUrl: string,
    id: string,
    tenantId: string,
    user: IUser,
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
