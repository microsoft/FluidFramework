/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IRequest } from "@fluidframework/core-interfaces";
import { Deferred } from "@fluidframework/common-utils";
import {
    IDocumentDeltaConnection,
    IDocumentDeltaStorageService,
    IDocumentService,
    IDocumentServiceFactory,
    IDocumentStorageService,
    IFluidResolvedUrl,
    IUrlResolver,
    IResolvedUrl,
} from "@fluidframework/driver-definitions";
import {
    IClient,
    IDocumentMessage,
    IVersion,
    ISummaryTree,
} from "@fluidframework/protocol-definitions";
import { IEventProvider, IEvent, ITelemetryBaseLogger } from "@fluidframework/common-definitions";
import * as Comlink from "comlink";
import { ensureFluidResolvedUrl } from "@fluidframework/driver-utils";
import { debug } from "./debug";
import { IOuterDocumentDeltaConnectionProxy } from "./innerDocumentDeltaConnection";

const socketIOEvents = [
    "op",
    "nack",
    "pong",
    "disconnect",
    "signal",
];

export interface ICombinedDriver {
    clientId: string;
    stream: IOuterDocumentDeltaConnectionProxy;
    deltaStorage: IDocumentDeltaStorageService;
    storage: IDocumentStorageService;
}

export interface IDocumentServiceFactoryProxy {
    clients: {
        [clientId: string]: ICombinedDriver;
    };
    getFluidUrl(): Promise<IFluidResolvedUrl>;
    createDocumentService(): Promise<string>;
    connected(): Promise<void>;
}

/**
 * Proxy of the Document Service Factory that gets sent to the innerFrame
 */
export class DocumentServiceFactoryProxy implements IDocumentServiceFactoryProxy {
    public clients: {
        [clientId: string]: ICombinedDriver,
    };

    constructor(
        private readonly documentServiceFactory: IDocumentServiceFactory,
        private readonly options: any,
        private readonly resolvedUrl: IFluidResolvedUrl,
        frame: HTMLIFrameElement,
    ) {
        this.clients = {};
        this.createProxy(frame);
    }

    public async createDocumentService(): Promise<string> {
        const connectedDocumentService: IDocumentService =
            await this.documentServiceFactory.createDocumentService(this.resolvedUrl);

        const clientDetails: IClient = this.options?.client ?
            (this.options.client as IClient) :
            {
                details: {
                    capabilities: { interactive: true },
                },
                mode: "write", // default reconnection mode on lost connection / connection error
                permission: [],
                scopes: [],
                user: { id: "" },
            };

        const [deltaStream, deltaStorage, storage] = await Promise.all([
            connectedDocumentService.connectToDeltaStream(clientDetails),
            connectedDocumentService.connectToDeltaStorage(),
            connectedDocumentService.connectToStorage(),
        ]);

        const clientId = deltaStream.clientId;
        const combinedDriver = {
            clientId,
            stream: this.getOuterDocumentDeltaConnection(deltaStream),
            deltaStorage: this.getDeltaStorage(deltaStorage),
            storage: this.getStorage(storage),
        };

        this.clients[clientId] = combinedDriver;

        return clientId;
    }

    // TODO: Issue-2109 Implement detach container api or put appropriate comment.
    public async createContainer(
        createNewSummary: ISummaryTree,
        resolvedUrl: IResolvedUrl,
        logger?: ITelemetryBaseLogger,
    ): Promise<IDocumentService> {
        throw new Error("Not implemented");
    }

    public async connected(): Promise<void> {
        debug("IFrame Connection Succeeded");
        return;
    }

    public async getFluidUrl(): Promise<IFluidResolvedUrl> {
        return Promise.resolve<IFluidResolvedUrl>({
            endpoints: {},
            tokens: {},
            type: "fluid",
            url: this.resolvedUrl.url,
        });
    }

    private createProxy(frame: HTMLIFrameElement) {
        // Host guarantees that frame and contentWindow are both loaded
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const iframeContentWindow = frame.contentWindow!;

        const proxy: IDocumentServiceFactoryProxy = {
            connected: Comlink.proxy(async () => this.connected()),
            clients: Comlink.proxy(this.clients),
            // Continue investigation of scope after feature check in
            createDocumentService: Comlink.proxy(async () => this.createDocumentService()),
            getFluidUrl: Comlink.proxy(async () => this.getFluidUrl()),
        };

        iframeContentWindow.window.postMessage("EndpointExposed", "*");
        Comlink.expose(proxy, Comlink.windowEndpoint(iframeContentWindow));
    }

    private getStorage(storage: IDocumentStorageService): IDocumentStorageService {
        return {
            repositoryUrl: "Not Implemented",
            getSnapshotTree: async (version?: IVersion) => {
                return storage.getSnapshotTree(version);
            },
            getVersions: async (versionId: string | null, count: number) => {
                return storage.getVersions(versionId, count);
            },
            read: async (id) => {
                return storage.read(id);
            },
            write: async (root, parents, message, ref) => {
                return storage.write(root, parents, message, ref);
            },
            createBlob: async (file) => {
                return storage.createBlob(file);
            },
            readBlob: async (blobId) => {
                return storage.readBlob(blobId);
            },
            getRawUrl: (blobId) => {
                return storage.getRawUrl(blobId);
            },
            uploadSummaryWithContext: async (summary, context) => {
                return storage.uploadSummaryWithContext(summary, context);
            },
            downloadSummary: async (handle) => {
                return storage.downloadSummary(handle);
            },
        };
    }

    private getDeltaStorage(deltaStorage: IDocumentDeltaStorageService): IDocumentDeltaStorageService {
        const get = Comlink.proxy(async (from?: number, to?: number) => deltaStorage.get(from, to));

        return {
            get,
        };
    }

    private getOuterDocumentDeltaConnection(deltaStream: IDocumentDeltaConnection) {
        // We'll buffer the events that we observe on the IDocumentDeltaConnection until the handshake completes
        const bufferedEvents: { type: string, args: any[] }[] = [];
        // we downcast here to remove typing, which make generically
        // forwarding all events easier
        const deltaStreamEventProvider = deltaStream as IEventProvider<IEvent>;

        // To unregister the handler later, we need to retain a reference to the handler function.
        const createBufferEventHandler = (eventName: string) => {
            return (...args: any[]) => bufferedEvents.push({ type: eventName, args });
        };
        const bufferEventHandlers = socketIOEvents.map((eventName: string) => {
            return {
                eventName,
                handler: createBufferEventHandler(eventName),
            };
        });
        bufferEventHandlers.forEach((eventHandler) => {
            deltaStreamEventProvider.on(eventHandler.eventName, eventHandler.handler);
        });

        const connection = {
            claims: deltaStream.claims,
            clientId: deltaStream.clientId,
            existing: deltaStream.existing,
            get initialClients() { return deltaStream.initialClients; },
            get initialMessages() { return deltaStream.initialMessages; },
            get initialSignals() { return deltaStream.initialSignals; },
            maxMessageSize: deltaStream.maxMessageSize,
            mode: deltaStream.mode,
            parentBranch: deltaStream.parentBranch,
            serviceConfiguration: deltaStream.serviceConfiguration,
            version: deltaStream.version,
            supportedVersions: ["^0.3.0", "^0.2.0", "^0.1.0"],
        };

        const getDetails = async () => connection;

        const submit = async (messages: IDocumentMessage[]) => {
            deltaStream.submit(messages);
        };

        const submitSignal = async (message: IDocumentMessage) => {
            deltaStream.submitSignal(message);
        };

        const handshake = new Deferred<any>();
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        handshake.promise
            .then((innerProxy: { forwardEvent(event: string, args: any[]): Promise<void> }) => {
                for (const op of bufferedEvents) {
                    // eslint-disable-next-line @typescript-eslint/no-floating-promises
                    innerProxy.forwardEvent(op.type, op.args);
                }

                bufferEventHandlers.forEach((eventHandler) => {
                    deltaStreamEventProvider.off(eventHandler.eventName, eventHandler.handler);
                });

                for (const event of socketIOEvents) {
                    deltaStreamEventProvider.on(
                        event,
                        // eslint-disable-next-line @typescript-eslint/no-misused-promises
                        async (...args: any[]) => { await innerProxy.forwardEvent(event, args); });
                }
            });

        const outerMethodsToProxy: IOuterDocumentDeltaConnectionProxy = {
            getDetails,
            handshake,
            submit,
            submitSignal,
        };

        return outerMethodsToProxy;
    }
}

/**
 * Creates a proxy outerdocumentservice from either a resolvedURL or a request
 * Remotes the real connection to an iframe
 */
export class IFrameDocumentServiceProxyFactory {
    public static async create(
        documentServiceFactory: IDocumentServiceFactory,
        frame: HTMLIFrameElement,
        options: any,
        urlResolver: IUrlResolver,
    ) {
        return new IFrameDocumentServiceProxyFactory(documentServiceFactory, frame, options, urlResolver);
    }

    public readonly protocolName = "fluid-outer:";

    constructor(
        private readonly documentServiceFactory: IDocumentServiceFactory,
        private readonly frame: HTMLIFrameElement,
        private readonly options: any,
        private readonly urlResolver: IUrlResolver,
    ) {

    }

    public async createDocumentService(resolvedUrl: IFluidResolvedUrl): Promise<IDocumentServiceFactoryProxy> {
        return new DocumentServiceFactoryProxy(
            this.documentServiceFactory,
            this.options,
            resolvedUrl,
            this.frame,
        );
    }

    public async createDocumentServiceFromRequest(request: IRequest): Promise<IDocumentServiceFactoryProxy> {
        const resolvedUrl = await this.urlResolver.resolve(request);
        ensureFluidResolvedUrl(resolvedUrl);

        return this.createDocumentService(resolvedUrl);
    }
}
