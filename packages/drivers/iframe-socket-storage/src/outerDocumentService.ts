/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import {
    ConnectionMode,
    IClient,
    IDocumentDeltaConnection,
    IDocumentDeltaStorageService,
    IDocumentService,
    IDocumentStorageService,
} from "@prague/protocol-definitions";
import { DocumentStorageService } from "@prague/routerlicious-socket-storage";
import {
    IConnected,
    IInnerDocumentDeltaConnectionProxy,
    IOuterDocumentDeltaConnection,
    OuterDocumentDeltaConnection,
} from "@prague/socket-storage-shared";
import { Deferred } from "@prague/utils";
import * as assert from "assert";
import * as Comlink from "comlink";
import { OuterDeltaStorageService } from "./outerDeltaStorageService";
import { OuterDocumentStorageService } from "./outerDocumentStorageService";

const protocolVersions = ["^0.2.0", "^0.1.0"];

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
        documentService: IDocumentService, frame: HTMLIFrameElement): Promise<OuterDocumentService> {

        const [storage, deltaStorage] = await Promise.all([documentService.connectToStorage(),
        documentService.connectToDeltaStorage()]);

        return new OuterDocumentService(
            storage as DocumentStorageService,
            deltaStorage,
            documentService,
            frame,
        );

    }

    private deltaConnection: IDocumentDeltaConnection | undefined;
    private readonly proxiedFunctionsFromInnerFrameP: Promise<IInnerProxy>;
    private getProxyFromOuterDocumentDeltaConnection!: (IOuterDocumentDeltaConnection) => any;
    private outerDocumentStorageService: IDocumentStorageService;
    private outerDeltaStorageService: IDocumentDeltaStorageService;

    constructor(private readonly storageService: DocumentStorageService,
                private readonly deltaStorage: IDocumentDeltaStorageService,
                private readonly documentService: IDocumentService,
                frame: HTMLIFrameElement,
    ) {
        this.outerDocumentStorageService = this.createDocumentStorageService(storageService);
        this.outerDeltaStorageService = this.createDeltaStorageService(deltaStorage);

        // Host guarantees that frame and contentwindow are both loaded
        const iframeContentWindow = frame!.contentWindow!;

        const handshake = new Deferred<IInnerProxy>();
        // tslint:disable-next-line: promise-must-complete
        this.proxiedFunctionsFromInnerFrameP = handshake.promise;

        const connected = async () => {
            return true;
        };

        // Put a callback in place to get the outerProxy from outerDocumentDeltaConnection
        // tslint:disable-next-line: promise-must-complete
        const deltaConnectionProxyP = new Promise<IOuterDocumentDeltaConnection>((resolve) => {
            this.getProxyFromOuterDocumentDeltaConnection = resolve;
        });

        deltaConnectionProxyP
            .then(async (deltaConnectionProxy) => {

                const outerDocumentServiceProxy: IOuterProxy = {
                    ...deltaConnectionProxy,
                    ...(this.outerDocumentStorageService as OuterDocumentStorageService)
                        .getOuterDocumentStorageServiceProxy(),
                    ...(this.outerDeltaStorageService as OuterDeltaStorageService)
                        .getOuterDocumentDeltaStorageProxy(),
                    handshake,
                    connected,
                };

                iframeContentWindow.window.postMessage("EndpointExposed", "*");
                const endpoint = Comlink.windowEndpoint(iframeContentWindow);
                Comlink.expose(outerDocumentServiceProxy, endpoint);
            })
            .catch((err) => {
                console.error(err);
            });
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
    public async connectToDeltaStream(client: IClient, mode: ConnectionMode): Promise<IDocumentDeltaConnection> {
        this.deltaConnection = await this.documentService.connectToDeltaStream(client, mode);
        assert((this.deltaConnection as any).socket !== undefined);

        const connection: IConnected = {
            claims: this.deltaConnection.claims,
            clientId: this.deltaConnection.clientId,
            existing: this.deltaConnection.existing,
            initialContents: this.deltaConnection.initialContents,
            initialMessages: this.deltaConnection.initialMessages,
            initialSignals: this.deltaConnection.initialSignals,
            maxMessageSize: this.deltaConnection.maxMessageSize,
            mode: this.deltaConnection.mode,
            parentBranch: this.deltaConnection.parentBranch,
            serviceConfiguration: this.deltaConnection.serviceConfiguration,
            version: this.deltaConnection.version,
            supportedVersions: protocolVersions,
        };

        return OuterDocumentDeltaConnection.create(
            this.deltaConnection,
            connection,
            this.proxiedFunctionsFromInnerFrameP,
            this.getProxyFromOuterDocumentDeltaConnection,
        );
    }

    public async branch(): Promise<string> {
        return Promise.reject(new Error("Outer Document Service: branch not implemented"));
    }

    public getErrorTrackingService() {
        throw new Error("Outer Document Service: getErrorTrackingService not implemented");
        return null;
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
