import { IEvent, ITelemetryBaseLogger } from "@fluidframework/common-definitions";
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
    IErrorTrackingService,
    IDocumentMessage,
    INack,
    NackErrorType,
// eslint-disable-next-line import/no-extraneous-dependencies
} from "@fluidframework/protocol-definitions";

export class FaultInjectionDocumentServiceFactory implements IDocumentServiceFactory {
    private  readonly _last = new Map<IResolvedUrl, FaultInjectionDocumentService>();

    public get protocolName() { return this.internal.protocolName;}
    public get documentServices() {return this._last;}

    constructor(private readonly internal: IDocumentServiceFactory) { }

    async createDocumentService(resolvedUrl: IResolvedUrl, logger?: ITelemetryBaseLogger): Promise<IDocumentService> {
        const internal = await this.internal.createDocumentService(resolvedUrl, logger);
        const ds = new FaultInjectionDocumentService(internal);
        assert(!this._last.has(resolvedUrl), "one ds per resolved url instance");
        this._last.set(resolvedUrl, ds);
        return ds;
    }
    async createContainer(
        createNewSummary: ISummaryTree,
        createNewResolvedUrl: IResolvedUrl,
        logger?: ITelemetryBaseLogger):
        Promise<IDocumentService> {
        return this.internal.createContainer(
            createNewSummary,
            createNewResolvedUrl,
            logger,
        );
    }
}

export class FaultInjectionDocumentService implements IDocumentService {
    private  _lastDeltaStream: FaultInjectionDocumentDeltaConnection | undefined;

    constructor(private readonly internal: IDocumentService) {
    }

    public get resolvedUrl() {return this.internal.resolvedUrl;}
    public get policies() {return this.internal.policies;}
    public get documentDeltaConnection() {
        return this._lastDeltaStream;
    }

    async connectToStorage(): Promise<IDocumentStorageService> {
        return this.internal.connectToStorage();
    }

    async connectToDeltaStorage(): Promise<IDocumentDeltaStorageService> {
        return this.internal.connectToDeltaStorage();
    }

    async connectToDeltaStream(client: IClient): Promise<IDocumentDeltaConnection> {
        assert(
            this._lastDeltaStream?.closed !== false,
            "Document service factory should only have one open connection");
        const internal = await this.internal.connectToDeltaStream(client);
        this._lastDeltaStream = new FaultInjectionDocumentDeltaConnection(internal);
        return this._lastDeltaStream;
    }

    /**
     * Returns the error tracking service
     */
    getErrorTrackingService(): IErrorTrackingService | null {
        return this.internal.getErrorTrackingService();
    }
}

export interface FaultInjectionDocumentDeltaConnectionEvents extends IEvent{
    (event: "sumbit" | "submitSignal",listener: () => void);
}

export class FaultInjectionDocumentDeltaConnection
extends EventForwarder<IDocumentDeltaConnectionEvents> implements IDocumentDeltaConnection {
    private _closed: boolean = false;
    constructor(private readonly internal: IDocumentDeltaConnection) {
        super(internal);
    }

    public get closed() {return this._closed;}

    public get clientId() { return this.internal.clientId;}

    public get claims() { return this.internal.claims;}

    public get mode() { return this.internal.mode;}
    public get existing() { return this.internal.existing;}
    public get maxMessageSize() { return this.internal.maxMessageSize;}
    public get version() { return this.internal.version;}
    public get initialMessages() { return this.internal.initialMessages;}

    public get initialSignals() { return this.internal.initialSignals;}
    public get initialClients() { return this.internal.initialClients;}
    public get serviceConfiguration() { return this.internal.serviceConfiguration;}
    public get checkpointSequenceNumber() { return this.internal.checkpointSequenceNumber;}

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
    close(): void {
        this._closed = true;
        this.internal.close();
    }

    public injectNack(docId: string) {
        assert(!this.closed, "cannot inject nack into close delta connection");
        const nack: Partial<INack> = {
            content:{
                code: 500,
                message: "FaultInjectionNack",
                type: NackErrorType.BadRequestError,
            },
        };
        this.emit("nack", docId, [nack]);
    }

    public injectError(canRetry: boolean | undefined) {
        assert(!this.closed, "cannot inject error into close delta connection");
        // https://nodejs.org/api/events.html#events_error_events
        assert(this.listenerCount("error") > 0,"emitting error with no listeners will crash the process");
        this.emit(
            "error",
            new FaultInjectionError(`FaultInjection${canRetry === true ? "Retriable" : "Fatal"}Error`, true));
    }
    public injectDisconnect() {
        assert(!this.closed, "cannot inject disconnect into close delta connection");
        this.emit("disconnect","FaultInjectionDisconnect");
    }
}

export class FaultInjectionError extends Error {
    constructor(
        message: string,
        public readonly canRetry: boolean | undefined) {
            super(message);
    }
}
