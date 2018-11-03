import * as api from "@prague/runtime-definitions";
import { GitManager, Historian, ICredentials } from "@prague/services-client";
import { DocumentDeltaConnection } from "@prague/socket-storage-shared";
import Axios from "axios";
import * as io from "socket.io-client";
import { DocumentStorageService } from "./blobStorageService";
import { DeltaStorageService, DocumentDeltaStorageService } from "./deltaStorageService";
import { WSDeltaConnection } from "./wsDeltaConnection";

/**
 * The DocumentService manages the Socket.IO connection and manages routing requests to connected
 * clients
 */
export class DocumentService implements api.IDocumentService {
    private deltaStorage: DeltaStorageService;

    constructor(
        protected deltaUrl: string,
        private gitUrl: string,
        private errorTracking: api.IErrorTrackingService,
        private disableCache: boolean,
        private historianApi: boolean,
        private directCredentials: ICredentials) {

        this.deltaStorage = new DeltaStorageService(this.deltaUrl);
    }

    public async connectToStorage(
        tenantId: string,
        id: string,
        token: string): Promise<api.IDocumentStorageService> {

        const endpoint = `${this.gitUrl}/repos/${encodeURIComponent(tenantId)}`;

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
        token: string,
        client: api.IClient): Promise<api.IDocumentDeltaConnection> {
        return DocumentDeltaConnection.Create(tenantId, id, token, io, client, this.deltaUrl);
    }

    public async branch(tenantId: string, id: string, token: string): Promise<string> {
        let headers = null;
        if (token) {
            headers = {
                Authorization: `Basic ${new Buffer(`${tenantId}:${token}`).toString("base64")}`,
            };
        }

        const result = await Axios.post<string>(`${this.deltaUrl}/documents/${tenantId}/${id}/forks`, { headers });
        return result.data;
    }

    public getErrorTrackingService() {
        return this.errorTracking;
    }
}

/**
 * The DocumentService manages the Socket.IO connection and manages routing requests to connected
 * clients
 */
export class DocumentService2 extends DocumentService {
    constructor(
        deltaUrl: string,
        gitUrl: string,
        errorTracking: api.IErrorTrackingService,
        disableCache: boolean,
        historianApi: boolean,
        directCredentials: ICredentials) {
        super(deltaUrl, gitUrl, errorTracking, disableCache, historianApi, directCredentials);
    }

    public async connectToDeltaStream(
        tenantId: string,
        id: string,
        token: string,
        client: api.IClient): Promise<api.IDocumentDeltaConnection> {
        return WSDeltaConnection.Create(tenantId, id, token, client, this.deltaUrl);
    }
}
