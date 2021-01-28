/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
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
    logger: ITelemetryBaseLogger;
}

export interface IDocumentServiceFactoryProxy {
    clients: {
        [clientId: string]: ICombinedDriver;
    };
    createDocumentService(
        resolvedUrlFn: () => Promise<IResolvedUrl>,
        // TODO: Create proxy ITelemetryBaseLogger (wrapping in getter fn is
        // insufficient) or never accept logger arg here
    ): Promise<string>;
    createContainer(
        createNewSummaryFn: () => Promise<ISummaryTree>,
        resolvedUrlFn: () => Promise<IResolvedUrl>,
        // TODO: Create proxy ITelemetryBaseLogger (wrapping in getter fn is
        // insufficient) or never accept logger arg here
    ): Promise<string>;
    connected(): Promise<void>;
}

export const IDocumentServiceFactoryProxyKey = "IDocumentServiceFactoryProxy";

/**
 * Proxy of the Document Service Factory that gets sent to the innerFrame
 */
export class DocumentServiceFactoryProxy implements IDocumentServiceFactoryProxy {
    private _clients: {
        [clientId: string]: ICombinedDriver,
    } = {};

    public get clients() { return Comlink.proxy(this._clients); }

    constructor(
        private readonly documentServiceFactory: IDocumentServiceFactory,
        private readonly options: any,
    ) { }

    public async createDocumentService(
        resolvedUrlFn: () => Promise<IResolvedUrl>,
    ): Promise<string> {
        const resolvedUrl = await resolvedUrlFn();
        const outerProxyLogger = ChildLogger.create(undefined, "OuterProxyIFrameDriver");
        const connectedDocumentService: IDocumentService =
            await this.documentServiceFactory.createDocumentService(resolvedUrl, outerProxyLogger);

        return this.getDocumentServiceProxy(connectedDocumentService, resolvedUrl, outerProxyLogger);
    }

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

    public async connected(): Promise<void> {
        debug("IFrame Connection Succeeded");
        return;
    }

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
            uploadSummaryWithContext: async (summary, context) => {
                return storage.uploadSummaryWithContext(summary, context);
            },
            downloadSummary: async (handle) => {
                return storage.downloadSummary(handle);
            },
        };
    }

    private getDeltaStorage(deltaStorage: IDocumentDeltaStorageService): IDocumentDeltaStorageService {
        const get = Comlink.proxy(async (from: number, to: number) => deltaStorage.get(from, to));

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
            // Back-compat, removal tracked with issue #4346
            parentBranch: null,
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

    private getLogger(logger: ITelemetryLogger): ITelemetryBaseLogger {
        return {
            send: (event) => logger.send(event),
        };
    }
}
