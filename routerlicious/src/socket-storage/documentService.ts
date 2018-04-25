import * as request from "request";
import * as io from "socket.io-client";
import * as api from "../api-core";
import { GitManager } from "../git-storage";
import { DocumentStorageService } from "./blobStorageService";
import { DocumentDeltaStorageService } from "./deltaStorageService";
import { DocumentDeltaConnection } from "./documentDeltaConnection";

/**
 * The DocumentService manages the Socket.IO connection and manages routing requests to connected
 * clients
 */
export class DocumentService implements api.IDocumentService {
    constructor(
        private url: string,
        private deltaStorage: api.IDeltaStorageService,
        private gitManager: GitManager) {
    }

    public async connectToStorage(
        tenantId: string,
        id: string,
        token: string): Promise<api.IDocumentStorageService> {
        return new DocumentStorageService(tenantId, id, this.gitManager);
    }

    public async connectToDeltaStorage(
        tenantId: string,
        id: string,
        token: string): Promise<api.IDocumentDeltaStorageService> {
        return new DocumentDeltaStorageService(tenantId, id, this.deltaStorage);
    }

    public async connectToDeltaStream(
        tenantId: string,
        id: string,
        token: string): Promise<api.IDocumentDeltaConnection> {
        return DocumentDeltaConnection.Create(tenantId, id, token, io, this.url);
    }

    public async branch(tenantId: string, id: string, token: string): Promise<string> {
        const forkId = await new Promise<string>((resolve, reject) => {
            request.post(
                { url: `${this.url}/documents/${tenantId}/${id}/forks`, json: true },
                (error, response, body) => {
                    if (error) {
                        reject(error);
                    } else if (response.statusCode !== 201) {
                        reject(response.statusCode);
                    } else {
                        resolve(body);
                    }
                });
        });

        return forkId;
    }
}
