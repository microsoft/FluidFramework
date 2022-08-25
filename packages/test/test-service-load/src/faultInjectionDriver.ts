/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IDisposable, ITelemetryBaseLogger } from "@fluidframework/common-definitions";
import { assert, EventForwarder } from "@fluidframework/common-utils";
import {
    IDocumentDeltaConnection,
    IDocumentDeltaConnectionEvents,
    IDocumentDeltaStorageService,
    IDocumentService,
    IDocumentServiceFactory,
    IDocumentStorageService,
    IResolvedUrl,
} from "@fluidframework/driver-definitions";
import {
    IClient,
    ISummaryTree,
    IDocumentMessage,
    INack,
    NackErrorType,
} from "@fluidframework/protocol-definitions";
import { LoggingError } from "@fluidframework/telemetry-utils";

export class FaultInjectionDocumentServiceFactory implements IDocumentServiceFactory {
    private readonly _documentServices = new Map<IResolvedUrl, FaultInjectionDocumentService>();

    public get protocolName() { return this.internal.protocolName; }
    public get documentServices() { return this._documentServices; }

    constructor(private readonly internal: IDocumentServiceFactory) { }

    async createDocumentService(
        resolvedUrl: IResolvedUrl,
        logger?: ITelemetryBaseLogger,
        clientIsSummarizer?: boolean,
    ): Promise<IDocumentService> {
        const internal = await this.internal.createDocumentService(resolvedUrl, logger, clientIsSummarizer);
        const ds = new FaultInjectionDocumentService(internal);
        assert(!this._documentServices.has(resolvedUrl), "one ds per resolved url instance");
        this._documentServices.set(resolvedUrl, ds);
        return ds;
    }
    async createContainer(
        createNewSummary: ISummaryTree,
        createNewResolvedUrl: IResolvedUrl,
        logger?: ITelemetryBaseLogger,
        clientIsSummarizer?: boolean,
    ):
        Promise<IDocumentService> {
        return this.internal.createContainer(
            createNewSummary,
            createNewResolvedUrl,
            logger,
            clientIsSummarizer,
        );
    }
}

export class FaultInjectionDocumentService implements IDocumentService {
    private _currentDeltaStream: FaultInjectionDocumentDeltaConnection | undefined;

    constructor(private readonly internal: IDocumentService) {
    }

    public get resolvedUrl() { return this.internal.resolvedUrl; }
    public get policies() { return this.internal.policies; }
    public get documentDeltaConnection() {
        return this._currentDeltaStream;
    }

    public dispose(error?: any) {
        this.internal.dispose(error);
    }

    async connectToStorage(): Promise<IDocumentStorageService> {
        return this.internal.connectToStorage();
    }

    async connectToDeltaStorage(): Promise<IDocumentDeltaStorageService> {
        return this.internal.connectToDeltaStorage();
    }

    async connectToDeltaStream(client: IClient): Promise<IDocumentDeltaConnection> {
        assert(
            this._currentDeltaStream?.disposed !== false,
            "Document service factory should only have one open connection");
        const internal = await this.internal.connectToDeltaStream(client);
        this._currentDeltaStream = new FaultInjectionDocumentDeltaConnection(internal);
        return this._currentDeltaStream;
    }
}

export class FaultInjectionDocumentDeltaConnection
extends EventForwarder<IDocumentDeltaConnectionEvents> implements IDocumentDeltaConnection, IDisposable {
    private _disposed: boolean = false;
    constructor(private readonly internal: IDocumentDeltaConnection) {
        super(internal);
    }

    public get disposed() { return this._disposed; }

    public get clientId() { return this.internal.clientId; }

    public get claims() { return this.internal.claims; }

    public get mode() { return this.internal.mode; }
    public get existing() { return this.internal.existing; }
    public get maxMessageSize() { return this.internal.serviceConfiguration.maxMessageSize; }
    public get version() { return this.internal.version; }
    public get initialMessages() { return this.internal.initialMessages; }

    public get initialSignals() { return this.internal.initialSignals; }
    public get initialClients() { return this.internal.initialClients; }
    public get serviceConfiguration() { return this.internal.serviceConfiguration; }
    public get checkpointSequenceNumber() { return this.internal.checkpointSequenceNumber; }

    /**
     * Submit a new message to the server
     */
    submit(messages: IDocumentMessage[]): void {
        this.internal.submit(messages);
    }

    /**
     * Submit a new signal to the server
     */
    submitSignal(message: any): void {
        this.internal.submitSignal(message);
    }

    /**
     * Disconnects the given delta connection
     */
    public dispose(): void {
        this._disposed = true;
        this.internal.dispose();
    }

    public injectNack(docId: string, canRetry: boolean | undefined) {
        assert(!this.disposed, "cannot inject nack into closed delta connection");
        const nack: Partial<INack> = {
            content: {
                code: canRetry === true ? 500 : 403,
                message: "FaultInjectionNack",
                type: NackErrorType.BadRequestError,
            },
        };
        this.emit("nack", docId, [nack]);
    }

    public injectError(canRetry: boolean | undefined) {
        assert(!this.disposed, "cannot inject error into closed delta connection");
        // https://nodejs.org/api/events.html#events_error_events
        assert(this.listenerCount("error") > 0, "emitting error with no listeners will crash the process");
        this.emit(
            "error",
            new FaultInjectionError("FaultInjectionError", canRetry));
    }
    public injectDisconnect() {
        assert(!this.disposed, "cannot inject disconnect into closed delta connection");
        this.emit("disconnect", "FaultInjectionDisconnect");
    }
}

export class FaultInjectionError extends LoggingError {
    errorType = "faultInjectionError";

    constructor(
        message: string,
        public readonly canRetry: boolean | undefined,
    ) {
        super(message, { testCategoryOverride: "generic" });
    }
}
