import * as api from "@prague/client-api";
import * as resources from "@prague/gitresources";
import { IDocumentService, IUser } from "@prague/runtime-definitions";
import { ISocketStorageDiscovery } from "./contracts";
import { DocumentService } from "./documentService";
import { TokenProvider } from "./token";

/**
 * Load a document based on the given user and socket storage discovery object
 * @param user User object
 * @param socketStorageDiscovery Socket storage discovery object
 * @returns Promise for a Document
 */
export async function loadFromSocketStorageDiscovery(
    user: IUser,
    socketStorageDiscovery: ISocketStorageDiscovery,
    options: any = {},
    version: resources.ICommit = null,
    connect = true): Promise<api.Document> {
    const tenantId = socketStorageDiscovery.tenantId;
    const documentId = socketStorageDiscovery.id;
    const snapshotUrl = socketStorageDiscovery.snapshotStorageUrl;
    const deltaStorageUrl = socketStorageDiscovery.deltaStorageUrl;
    const webSocketUrl = socketStorageDiscovery.deltaStreamSocketUrl;

    const tokenProvider = new TokenProvider(socketStorageDiscovery.storageToken, socketStorageDiscovery.socketToken);

    const documentService = createDocumentService(snapshotUrl, deltaStorageUrl, webSocketUrl);

    return api.load(documentId, tenantId, user, tokenProvider, options, version, connect, documentService);
}

/**
 * Creates a document service based on the given urls
 */
export function createDocumentService(
    snapshotUrl: string,
    deltaStorageUrl: string,
    webSocketUrl: string): IDocumentService {
    return new DocumentService(snapshotUrl, deltaStorageUrl, webSocketUrl);
}
