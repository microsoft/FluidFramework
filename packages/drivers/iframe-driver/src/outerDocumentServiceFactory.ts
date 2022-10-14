/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as Comlink from "comlink";
import {
    IEventProvider,
    IEvent,
    ITelemetryBaseLogger,
    ITelemetryLogger,
} from "@fluidframework/common-definitions";
import { Deferred } from "@fluidframework/common-utils";
import {
    IDocumentDeltaConnection,
    IDocumentDeltaStorageService,
    IDocumentService,
    IDocumentServiceFactory,
    IDocumentStorageService,
    IResolvedUrl,
} from "@fluidframework/driver-definitions";
import {
    IClient,
    IDocumentMessage,
    IVersion,
    ISummaryTree,
} from "@fluidframework/protocol-definitions";
import { ChildLogger } from "@fluidframework/telemetry-utils";
import { IOuterDocumentDeltaConnectionProxy } from "./innerDocumentDeltaConnection";

const socketIOEvents = [
    "op",
    "nack",
    "pong",
    "disconnect",
    "signal",
];

/**
 * @deprecated The iframe-driver is deprecated and should not be used, it will be removed in an upcoming release
 */
export interface ICombinedDriver {
    /**
     * @deprecated The iframe-driver is deprecated and should not be used, it will be removed in an upcoming release
     */
    clientId: string;
    /**
     * @deprecated The iframe-driver is deprecated and should not be used, it will be removed in an upcoming release
     */
    stream: IOuterDocumentDeltaConnectionProxy;
    /**
     * @deprecated The iframe-driver is deprecated and should not be used, it will be removed in an upcoming release
     */
    deltaStorage: IDocumentDeltaStorageService;
    /**
     * @deprecated The iframe-driver is deprecated and should not be used, it will be removed in an upcoming release
     */
    storage: IDocumentStorageService;
    /**
     * @deprecated The iframe-driver is deprecated and should not be used, it will be removed in an upcoming release
     */
    logger: ITelemetryBaseLogger;
}

/**
 * @deprecated The iframe-driver is deprecated and should not be used, it will be removed in an upcoming release
 */
export interface IDocumentServiceFactoryProxy {
    /**
     * @deprecated The iframe-driver is deprecated and should not be used, it will be removed in an upcoming release
     */
    clients: {
        [clientId: string]: ICombinedDriver;
    };
    /**
     * @deprecated The iframe-driver is deprecated and should not be used, it will be removed in an upcoming release
     */
    createDocumentService(
        resolvedUrlFn: () => Promise<IResolvedUrl>,
        // TODO: Create proxy ITelemetryBaseLogger (wrapping in getter fn is
        // insufficient) or never accept logger arg here
    ): Promise<string>;
    /**
     * @deprecated The iframe-driver is deprecated and should not be used, it will be removed in an upcoming release
     */
    createContainer(
        createNewSummaryFn: () => Promise<ISummaryTree>,
        resolvedUrlFn: () => Promise<IResolvedUrl>,
        // TODO: Create proxy ITelemetryBaseLogger (wrapping in getter fn is
        // insufficient) or never accept logger arg here
    ): Promise<string>;
    /**
     * @deprecated The iframe-driver is deprecated and should not be used, it will be removed in an upcoming release
     */
    connected(): Promise<void>;
}

/**
 * @deprecated The iframe-driver is deprecated and should not be used, it will be removed in an upcoming release
 */
export const IDocumentServiceFactoryProxyKey = "IDocumentServiceFactoryProxy";

/**
 * Proxy of the Document Service Factory that gets sent to the innerFrame
 * @deprecated The iframe-driver is deprecated and should not be used, it will be removed in an upcoming release
 */
export class DocumentServiceFactoryProxy implements IDocumentServiceFactoryProxy {
    private _clients: {
        [clientId: string]: ICombinedDriver;
    } = {};

    /**
     * @deprecated The iframe-driver is deprecated and should not be used, it will be removed in an upcoming release
     */
    public get clients() { return Comlink.proxy(this._clients); }

    /**
     * @deprecated The iframe-driver is deprecated and should not be used, it will be removed in an upcoming release
     */
    constructor(
        private readonly documentServiceFactory: IDocumentServiceFactory,
        private readonly options: any,
    ) { }

    /**
     * @deprecated The iframe-driver is deprecated and should not be used, it will be removed in an upcoming release
     */
    public async createDocumentService(
        resolvedUrlFn: () => Promise<IResolvedUrl>,
    ): Promise<string> {
        const resolvedUrl = await resolvedUrlFn();
        const outerProxyLogger = ChildLogger.create(undefined, "OuterProxyIFrameDriver");
        const connectedDocumentService: IDocumentService =
            await this.documentServiceFactory.createDocumentService(
                resolvedUrl,
                outerProxyLogger,
                false, // clientIsSummarizer
            );

        return this.getDocumentServiceProxy(connectedDocumentService, resolvedUrl, outerProxyLogger);
    }

    /**
     * @deprecated The iframe-driver is deprecated and should not be used, it will be removed in an upcoming release
     */
    public async createContainer(
        createNewSummaryFn: () => Promise<ISummaryTree>,
        resolvedUrlFn: () => Promise<IResolvedUrl>,
    ): Promise<string> {
        const createNewSummary = await createNewSummaryFn();
        const resolvedUrl = await resolvedUrlFn();
        const outerProxyLogger = ChildLogger.create(undefined, "OuterProxyIFrameDriver");
        const connectedDocumentService: IDocumentService =
            await this.documentServiceFactory.createContainer(createNewSummary, resolvedUrl, outerProxyLogger);

        return this.getDocumentServiceProxy(connectedDocumentService, resolvedUrl, outerProxyLogger);
    }

    /**
     * @deprecated The iframe-driver is deprecated and should not be used, it will be removed in an upcoming release
     */
    public async connected(): Promise<void> {
        return;
    }

    /**
     * @deprecated The iframe-driver is deprecated and should not be used, it will be removed in an upcoming release
     */
    public createProxy(): IDocumentServiceFactoryProxy {
        const proxy: IDocumentServiceFactoryProxy = {
            connected: Comlink.proxy(async () => this.connected()),
            clients: Comlink.proxy(this._clients),
            // Continue investigation of scope after feature check in
            createDocumentService: Comlink.proxy(async (resolvedUrl) => this.createDocumentService(resolvedUrl)),
            createContainer: Comlink.proxy(
                async (createNewSummary, resolvedUrl) => {
                    return Comlink.proxy(this.createContainer(createNewSummary, resolvedUrl));
                },
            ),
        };

        return proxy;
    }

    private async getDocumentServiceProxy(
        connectedDocumentService: IDocumentService,
        resolvedUrl: IResolvedUrl,
        outerProxyLogger: ITelemetryLogger,
    ): Promise<string> {
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
            logger: this.getLogger(outerProxyLogger),
        };

        this._clients[clientId] = combinedDriver;

        return clientId;
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
            createBlob: async (file) => {
                return storage.createBlob(file);
            },
            readBlob: async (blobId) => {
                return storage.readBlob(blobId);
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
        const fetchMessages = Comlink.proxy(deltaStorage.fetchMessages.bind(deltaStorage));

        return {
            fetchMessages,
        };
    }

    private getOuterDocumentDeltaConnection(deltaStream: IDocumentDeltaConnection) {
        // We'll buffer the events that we observe on the IDocumentDeltaConnection until the handshake completes
        const bufferedEvents: { type: string; args: any[]; }[] = [];
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
            maxMessageSize: deltaStream.serviceConfiguration.maxMessageSize,
            mode: deltaStream.mode,
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
            .then((innerProxy: { forwardEvent(event: string, args: any[]): Promise<void>; }) => {
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

    private getLogger(logger: ITelemetryLogger): ITelemetryBaseLogger {
        return {
            send: (event) => logger.send(event),
        };
    }
}
