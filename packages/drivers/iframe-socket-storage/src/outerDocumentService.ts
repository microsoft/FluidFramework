/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import { Deferred } from "@microsoft/fluid-core-utils";
import {
    IConnected,
} from "@microsoft/fluid-driver-base";
import {
    ConnectionMode,
    IClient,
    IDocumentDeltaConnection,
    IDocumentDeltaStorageService,
    IDocumentService,
    IDocumentStorageService,
    ScopeType,
} from "@microsoft/fluid-protocol-definitions";
import { DocumentStorageService } from "@microsoft/fluid-routerlicious-driver";
import * as assert from "assert";
import * as Comlink from "comlink";
import { OuterDeltaStorageService } from "./outerDeltaStorageService";
import {
    IInnerDocumentDeltaConnectionProxy,
    IOuterDocumentDeltaConnection,
    OuterDocumentDeltaConnection,
} from "./outerDocumentDeltaConnection";
import { OuterDocumentStorageService } from "./outerDocumentStorageService";

const protocolVersions = ["^0.3.0", "^0.2.0", "^0.1.0"];

// tslint:disable-next-line: no-empty-interface
interface IInnerProxy extends IInnerDocumentDeltaConnectionProxy {

}

export interface IOuterProxy extends IOuterDocumentDeltaConnection,
    IDocumentStorageService,
    IDocumentDeltaStorageService {
    handshake: any;
    connected(): Promise<boolean>;
}

/**
 * The shell of the document Service that we'll use on the inside of an IFrame
 */
export class OuterDocumentService implements IDocumentService {
    public static async create(
        documentService: IDocumentService,
        frame: HTMLIFrameElement,
        mode: ConnectionMode): Promise<OuterDocumentService> {
        const client: IClient = {
            permission: [],
            scopes: [ScopeType.DocRead, ScopeType.DocWrite, ScopeType.SummaryWrite],
            type: "browser",
            user: {
                id: "iframe-user",
            },
        };

        const [storage, deltaStorage, deltaConnection] = await Promise.all([
            documentService.connectToStorage(),
            documentService.connectToDeltaStorage(),
            documentService.connectToDeltaStream(client, mode),
        ]);

        return new OuterDocumentService(
            storage as DocumentStorageService,
            deltaStorage,
            deltaConnection,
            frame,
        );
    }

    private readonly handshake: Deferred<IInnerProxy>;
    private outerDocumentStorageService: IDocumentStorageService;
    private outerDeltaStorageService: IDocumentDeltaStorageService;
    private outerDocumentDeltaConnection: IDocumentDeltaConnection;

    constructor(
        private readonly storageService: DocumentStorageService,
        private readonly deltaStorage: IDocumentDeltaStorageService,
        private readonly deltaConnection: IDocumentDeltaConnection,
        frame: HTMLIFrameElement,
    ) {
        this.handshake = new Deferred<IInnerProxy>();

        this.outerDocumentStorageService = this.createDocumentStorageService(storageService);
        this.outerDeltaStorageService = this.createDeltaStorageService(deltaStorage);
        this.outerDocumentDeltaConnection = this.createDocumentDeltaConnection(undefined as unknown as IClient);

        // Host guarantees that frame and contentwindow are both loaded
        const iframeContentWindow = frame!.contentWindow!;

        const connected = async () => {
            return true;
        };

        const outerDocumentServiceProxy: IOuterProxy = {
            ...(this.outerDocumentDeltaConnection as OuterDocumentDeltaConnection)
                .getOuterDocumentDeltaConnection(),
            ...(this.outerDocumentStorageService as OuterDocumentStorageService)
                .getOuterDocumentStorageServiceProxy(),
            ...(this.outerDeltaStorageService as OuterDeltaStorageService)
                .getOuterDocumentDeltaStorageProxy(),
            handshake: this.handshake,
            connected,
        };

        iframeContentWindow.window.postMessage("EndpointExposed", "*");
        const endpoint = Comlink.windowEndpoint(iframeContentWindow);
        Comlink.expose(outerDocumentServiceProxy, endpoint);
    }

    /**
     * Connects to a storage endpoint for snapshot service.
     *
     * @returns returns the document storage service for routerlicious driver.
     */
    public async connectToStorage(): Promise<IDocumentStorageService> {
        return this.createDocumentStorageService(this.storageService);
    }

    /**
     * Connects to a delta storage endpoint for getting ops between a range.
     *
     * @returns returns the document delta storage service for routerlicious driver.
     */
    public async connectToDeltaStorage(): Promise<IDocumentDeltaStorageService> {
        return this.createDeltaStorageService(this.deltaStorage);
    }

    /**
     * Connects to a delta stream endpoint for emitting ops.
     *
     * @returns returns the document delta stream service for routerlicious driver.
     */
    public async connectToDeltaStream(
            client: IClient,
            mode: ConnectionMode,
            callback: (connection: IDocumentDeltaConnection) => void) {
        callback(this.createDocumentDeltaConnection(client));
    }

    public async branch(): Promise<string> {
        return Promise.reject(new Error("Outer Document Service: branch not implemented"));
    }

    public getErrorTrackingService() {
        throw new Error("Outer Document Service: getErrorTrackingService not implemented");
        return null;
    }

    private createDocumentDeltaConnection(client: IClient): IDocumentDeltaConnection {
        if (!this.outerDocumentDeltaConnection) {
            const proxiedFunctionsFromInnerFrameP = this.handshake.promise;

            assert((this.deltaConnection as any).socket !== undefined);
            console.log(client);

            const connection: IConnected = {
                claims: this.deltaConnection.claims,
                clientId: this.deltaConnection.clientId,
                existing: this.deltaConnection.existing,
                initialContents: this.deltaConnection.initialContents,
                initialMessages: this.deltaConnection.initialMessages,
                initialSignals: this.deltaConnection.initialSignals,
                initialClients: this.deltaConnection.initialClients,
                maxMessageSize: this.deltaConnection.maxMessageSize,
                mode: this.deltaConnection.mode,
                parentBranch: this.deltaConnection.parentBranch,
                serviceConfiguration: this.deltaConnection.serviceConfiguration,
                version: this.deltaConnection.version,
                supportedVersions: protocolVersions,
            };

            this.outerDocumentDeltaConnection = OuterDocumentDeltaConnection.create(
                this.deltaConnection,
                connection,
                proxiedFunctionsFromInnerFrameP,
            );
        }

        return this.outerDocumentDeltaConnection;
    }

    private createDocumentStorageService(storageService: DocumentStorageService) {
        if (!this.outerDocumentStorageService) {
            this.outerDocumentStorageService = new OuterDocumentStorageService(storageService);
        }
        return this.outerDocumentStorageService;
    }

    private createDeltaStorageService(deltaStorage: IDocumentDeltaStorageService) {
        if (!this.outerDeltaStorageService) {
            this.outerDeltaStorageService = new OuterDeltaStorageService(deltaStorage);
        }
        return this.outerDeltaStorageService;
    }
}
