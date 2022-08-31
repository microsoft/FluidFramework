/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IDisposable, ITelemetryBaseLogger } from "@fluidframework/common-definitions";
import { assert, EventForwarder } from "@fluidframework/common-utils";
import {
    DriverErrorType,
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

function throwOfflineError(): never {
    const error = new Error("simulated offline error");
    (error as any).errorType = DriverErrorType.offlineError;

    // ODSP driver will retry 5 times then throw a non-retryable error
    (error as any).canRetry = false;
    throw error;
}

export class FaultInjectionDocumentService implements IDocumentService {
    private _currentDeltaStream?: FaultInjectionDocumentDeltaConnection;
    private _currentDeltaStorage?: FaultInjectionDocumentDeltaStorageService;
    private _currentStorage?: FaultInjectionDocumentStorageService;

    private _online = true;
    public get online() { return this._online; }

    public goOffline() {
        this._online = false;
        assert(!!this._currentDeltaStream, "no delta stream");
        assert(!!this._currentStorage, "no storage");
        this._currentDeltaStream.goOffline();
        this._currentStorage.goOffline();
        this._currentDeltaStorage?.goOffline();
    }

    public goOnline() {
        this._online = true;
        assert(!!this._currentDeltaStream, "no delta stream");
        assert(!!this._currentStorage, "no storage");
        this._currentDeltaStream.goOnline();
        this._currentStorage.goOnline();
        this._currentDeltaStorage?.goOnline();
    }

    constructor(private readonly internal: IDocumentService) {
    }

    public get resolvedUrl() { return this.internal.resolvedUrl; }
    public get policies() { return this.internal.policies; }
    public get documentDeltaConnection() {
        return this._currentDeltaStream;
    }
    public get documentDeltaStorageService() {
        return this._currentDeltaStorage;
    }
    public get documentStorageService() {
        return this._currentStorage;
    }

    public dispose(error?: any) {
        this.internal.dispose(error);
    }

    async connectToDeltaStream(client: IClient): Promise<IDocumentDeltaConnection> {
        assert(
            this._currentDeltaStream?.disposed !== false,
            "Document service factory should only have one open connection");
        const internal = await this.internal.connectToDeltaStream(client);
        this._currentDeltaStream = new FaultInjectionDocumentDeltaConnection(internal, this.online);
        return this._currentDeltaStream;
    }

    async connectToStorage(): Promise<IDocumentStorageService> {
        const internal = await this.internal.connectToStorage();
        this._currentStorage = new FaultInjectionDocumentStorageService(internal, this.online);
        return this._currentStorage;
    }

    async connectToDeltaStorage(): Promise<IDocumentDeltaStorageService> {
        const internal = await this.internal.connectToDeltaStorage();
        this._currentDeltaStorage = new FaultInjectionDocumentDeltaStorageService(internal, this.online);
        return this._currentDeltaStorage;
    }
}

export class FaultInjectionDocumentDeltaStorageService implements IDocumentDeltaStorageService {
    constructor(private readonly internal: IDocumentDeltaStorageService, private online: boolean) { }
    public goOffline() { this.online = false; }
    public goOnline() { this.online = true; }

    public fetchMessages(from, to, abortSignal, cachedOnly, fetchReason) {
        if (!this.online) {
            throwOfflineError();
        }
        return this.internal.fetchMessages(from, to, abortSignal, cachedOnly, fetchReason);
    }
}

export class FaultInjectionDocumentStorageService implements IDocumentStorageService {
    constructor(private readonly internal: IDocumentStorageService, private online: boolean) { }

    public goOffline() {
        this.online = false;
    }
    public goOnline() {
        this.online = true;
    }

    private throwIfOffline() {
        if (!this.online) {
            throwOfflineError();
        }
    }

    public get repositoryUrl(): string { return this.internal.repositoryUrl; }
    public get policies() { return this.internal.policies; }

    public async getSnapshotTree(version, scenarioName?: string) {
        this.throwIfOffline();
        return this.internal.getSnapshotTree(version, scenarioName);
    }

    public async getVersions(versionId, count, scenarioName, fetchSource) {
        this.throwIfOffline();
        return this.internal.getVersions(versionId, count, scenarioName, fetchSource);
    }

    public async createBlob(file: ArrayBufferLike) {
        this.throwIfOffline();
        return this.internal.createBlob(file);
    }

    public async readBlob(id: string): Promise<ArrayBufferLike> {
        this.throwIfOffline();
        return this.internal.readBlob(id);
    }

    public async uploadSummaryWithContext(summary: ISummaryTree, context): Promise<string> {
        this.throwIfOffline();
        return this.internal.uploadSummaryWithContext(summary, context);
    }

    public async downloadSummary(handle): Promise<ISummaryTree> {
        this.throwIfOffline();
        return this.internal.downloadSummary(handle);
    }
}

export class FaultInjectionDocumentDeltaConnection
extends EventForwarder<IDocumentDeltaConnectionEvents> implements IDocumentDeltaConnection, IDisposable {
    private _disposed: boolean = false;
    constructor(private readonly internal: IDocumentDeltaConnection, private online: boolean) {
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
        if (this.online) {
            // should probably simulate messages that are successful even though we don't see the ACK
            // could just submit a random number of messages after going offline
            this.internal.submit(messages);
        }
    }

    /**
     * Submit a new signal to the server
     */
    submitSignal(message: any): void {
        if (this.online) {
            this.internal.submitSignal(message);
        }
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

    public goOffline() {
        this.online = false;
    }

    public goOnline() {
        this.online = true;
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
