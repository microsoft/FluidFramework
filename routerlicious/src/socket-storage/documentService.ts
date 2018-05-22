import * as request from "request";
import * as io from "socket.io-client";
import * as api from "../api-core";
import { GitManager } from "../git-storage";
import { Historian, ICredentials } from "../services-client";
import { DocumentStorageService } from "./blobStorageService";
import { DeltaStorageService, DocumentDeltaStorageService } from "./deltaStorageService";
import { DocumentDeltaConnection } from "./documentDeltaConnection";

/**
 * The DocumentService manages the Socket.IO connection and manages routing requests to connected
 * clients
 */
export class DocumentService implements api.IDocumentService {
    private deltaStorage: DeltaStorageService;

    constructor(
        private deltaUrl: string,
        private gitUrl: string,
        private errorTracking: boolean,
        private disableCache: boolean,
        private historianApi: boolean,
        private directCredentials: ICredentials) {

        this.deltaStorage = new DeltaStorageService(this.deltaUrl);
    }

    public async connectToStorage(
        tenantId: string,
        id: string,
        token: string): Promise<api.IDocumentStorageService> {

        const endpoint = `${this.gitUrl}/repos/${tenantId}`;

        // Craft credentials - either use the direct credentials (i.e. a GitHub user + PAT) - or make use of our
        // tenant token
        let credentials: ICredentials;
        if (this.directCredentials) {
            credentials = this.directCredentials;
        } else if (token) {
            credentials = {
                password: token,
                user: tenantId,
            };
        }

        const historian = new Historian(
            endpoint,
            this.historianApi,
            this.disableCache,
            credentials);
        const gitManager = new GitManager(historian);
        return new DocumentStorageService(tenantId, id, gitManager);
    }

    public async connectToDeltaStorage(
        tenantId: string,
        id: string,
        token: string): Promise<api.IDocumentDeltaStorageService> {

        return new DocumentDeltaStorageService(tenantId, id, token, this.deltaStorage);
    }

    public async connectToDeltaStream(
        tenantId: string,
        id: string,
        token: string): Promise<api.IDocumentDeltaConnection> {
        return DocumentDeltaConnection.Create(tenantId, id, token, io, this.deltaUrl);
    }

    public async branch(tenantId: string, id: string, token: string): Promise<string> {
        let headers = null;
        if (token) {
            headers = {
                Authorization: `Basic ${new Buffer(`${tenantId}:${token}`).toString("base64")}`,
            };
        }

        const forkId = await new Promise<string>((resolve, reject) => {
            request.post(
                {
                    headers,
                    json: true,
                    url: `${this.deltaUrl}/documents/${tenantId}/${id}/forks`,
                },
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

    public errorTrackingEnabled() {
        return this.errorTracking;
    }
}
