/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { default as AbortController } from "abort-controller";
import { v4 as uuid } from "uuid";
import { ITelemetryLogger, IEventProvider } from "@fluidframework/common-definitions";
import {
    IConnectionDetails,
    IDeltaHandlerStrategy,
    IDeltaManager,
    IDeltaManagerEvents,
    IDeltaQueue,
    ICriticalContainerError,
    IThrottlingWarning,
    ReadOnlyInfo,
} from "@fluidframework/container-definitions";
import { assert, performance, TypedEventEmitter } from "@fluidframework/common-utils";
import { TelemetryLogger, safeRaiseEvent, logIfFalse } from "@fluidframework/telemetry-utils";
import {
    IDocumentDeltaStorageService,
    IDocumentService,
    IDocumentDeltaConnection,
    IDocumentDeltaConnectionEvents,
    DriverError,
    DriverErrorType,
} from "@fluidframework/driver-definitions";
import { isSystemMessage } from "@fluidframework/protocol-base";
import {
    ConnectionMode,
    IClient,
    IClientConfiguration,
    IClientDetails,
    IDocumentMessage,
    INack,
    INackContent,
    ISequencedDocumentMessage,
    ISignalClient,
    ISignalMessage,
    ITokenClaims,
    ITrace,
    MessageType,
    ScopeType,
} from "@fluidframework/protocol-definitions";
import {
    canRetryOnError,
    createWriteError,
    createGenericNetworkError,
    getRetryDelayFromError,
    logNetworkFailure,
    waitForConnectedState,
    NonRetryableError,
    DeltaStreamConnectionForbiddenError,
} from "@fluidframework/driver-utils";
import {
    ThrottlingWarning,
    CreateContainerError,
    CreateProcessingError,
    DataCorruptionError,
    wrapError,
} from "@fluidframework/container-utils";
import { DeltaQueue } from "./deltaQueue";

const MaxReconnectDelayInMs = 8000;
const InitialReconnectDelayInMs = 1000;
const DefaultChunkSize = 16 * 1024;

function getNackReconnectInfo(nackContent: INackContent) {
    const reason = `Nack: ${nackContent.message}`;
    const canRetry = nackContent.code !== 403;
    const retryAfterMs = nackContent.retryAfter !== undefined ? nackContent.retryAfter * 1000 : undefined;
    return createGenericNetworkError(reason, canRetry, retryAfterMs, { statusCode: nackContent.code });
}

const createReconnectError = (prefix: string, err: any) =>
    wrapError(
        err,
        (errorMessage: string) => createGenericNetworkError(`${prefix}: ${errorMessage}`, true /* canRetry */),
    );

export interface IConnectionArgs {
    mode?: ConnectionMode;
    fetchOpsFromStorage?: boolean;
    reason: string;
}

export enum ReconnectMode {
    Never = "Never",
    Disabled = "Disabled",
    Enabled = "Enabled",
}

/**
 * Includes events emitted by the concrete implementation DeltaManager
 * but not exposed on the public interface IDeltaManager
 */
export interface IDeltaManagerInternalEvents extends IDeltaManagerEvents {
    (event: "throttled", listener: (error: IThrottlingWarning) => void);
    (event: "closed", listener: (error?: ICriticalContainerError) => void);
}

/**
 * Implementation of IDocumentDeltaConnection that does not support submitting
 * or receiving ops. Used in storage-only mode.
 */
class NoDeltaStream extends TypedEventEmitter<IDocumentDeltaConnectionEvents> implements IDocumentDeltaConnection {
    clientId: string = "storage-only client";
    claims: ITokenClaims = {
        scopes: [ScopeType.DocRead],
    } as any;
    mode: ConnectionMode = "read";
    existing: boolean = true;
    maxMessageSize: number = 0;
    version: string = "";
    initialMessages: ISequencedDocumentMessage[] = [];
    initialSignals: ISignalMessage[] = [];
    initialClients: ISignalClient[] = [];
    serviceConfiguration: IClientConfiguration = undefined as any;
    checkpointSequenceNumber?: number | undefined = undefined;
    submit(messages: IDocumentMessage[]): void {
        this.emit("nack", this.clientId, messages.map((operation) => {
            return {
                operation,
                content: { message: "Cannot submit with storage-only connection", code: 403 },
            };
        }));
    }
    submitSignal(message: any): void {
        this.emit("nack", this.clientId, {
            operation: message,
            content: { message: "Cannot submit signal with storage-only connection", code: 403 },
        });
    }
    close(): void {
    }
}

/**
 * Manages the flow of both inbound and outbound messages. This class ensures that shared objects receive delta
 * messages in order regardless of possible network conditions or timings causing out of order delivery.
 */
export class DeltaManager
    extends TypedEventEmitter<IDeltaManagerInternalEvents>
    implements
    IDeltaManager<ISequencedDocumentMessage, IDocumentMessage>,
    IEventProvider<IDeltaManagerInternalEvents>
{
    public get active(): boolean { return this._active(); }

    public get disposed() { return this.closed; }

    public readonly clientDetails: IClientDetails;
    public get IDeltaSender() { return this; }

    /**
     * Controls whether the DeltaManager will automatically reconnect to the delta stream after receiving a disconnect.
     */
    private _reconnectMode: ReconnectMode;

    // file ACL - whether user has only read-only access to a file
    private _readonlyPermissions: boolean | undefined;

    // tracks host requiring read-only mode.
    private _forceReadonly = false;

    // Connection mode used when reconnecting on error or disconnect.
    private readonly defaultReconnectionMode: ConnectionMode;

    private pending: ISequencedDocumentMessage[] = [];
    private fetchReason: string | undefined;

    // The minimum sequence number and last sequence number received from the server
    private minSequenceNumber: number = 0;

    // There are three numbers we track
    // * lastQueuedSequenceNumber is the last queued sequence number. If there are gaps in seq numbers, then this number
    //   is not updated until we cover that gap, so it increases each time by 1.
    // * lastObservedSeqNumber is  an estimation of last known sequence number for container in storage. It's initially
    //   populated at web socket connection time (if storage provides that info) and is  updated once ops shows up.
    //   It's never less than lastQueuedSequenceNumber
    // * lastProcessedSequenceNumber - last processed sequence number
    private lastQueuedSequenceNumber: number = 0;
    private lastObservedSeqNumber: number = 0;
    private lastProcessedSequenceNumber: number = 0;
    private lastProcessedMessage: ISequencedDocumentMessage | undefined;
    private baseTerm: number = 0;

    private prevEnqueueMessagesReason: string | undefined;
    private previouslyProcessedMessage: ISequencedDocumentMessage | undefined;

    // The sequence number we initially loaded from
    private initSequenceNumber: number = 0;

    private readonly _inbound: DeltaQueue<ISequencedDocumentMessage>;
    private readonly _inboundSignal: DeltaQueue<ISignalMessage>;
    private readonly _outbound: DeltaQueue<IDocumentMessage[]>;

    private connectionP: Promise<IDocumentDeltaConnection> | undefined;
    private connection: IDocumentDeltaConnection | undefined;
    private clientSequenceNumber = 0;
    private clientSequenceNumberObserved = 0;
    // Counts the number of noops sent by the client which may not be acked.
    private trailingNoopCount = 0;
    private closed = false;
    private readonly deltaStreamDelayId = uuid();
    private readonly deltaStorageDelayId = uuid();

    // track clientId used last time when we sent any ops
    private lastSubmittedClientId: string | undefined;

    private handler: IDeltaHandlerStrategy | undefined;
    private deltaStorage: IDocumentDeltaStorageService | undefined;

    private messageBuffer: IDocumentMessage[] = [];

    private connectFirstConnection = true;
    private readonly throttlingIdSet = new Set<string>();
    private timeTillThrottling: number = 0;

    private connectionStateProps: Record<string, string | number> = {};

    // True if current connection has checkpoint information
    // I.e. we know how far behind the client was at the time of establishing connection
    private _hasCheckpointSequenceNumber = false;

    private readonly closeAbortController = new AbortController();

    /**
     * Tells if  current connection has checkpoint information.
     * I.e. we know how far behind the client was at the time of establishing connection
     */
    public get hasCheckpointSequenceNumber() {
        // Valid to be called only if we have active connection.
        assert(this.connection !== undefined, 0x0df /* "Missing active connection" */);
        return this._hasCheckpointSequenceNumber;
    }

    public get inbound(): IDeltaQueue<ISequencedDocumentMessage> {
        return this._inbound;
    }

    public get outbound(): IDeltaQueue<IDocumentMessage[]> {
        return this._outbound;
    }

    public get inboundSignal(): IDeltaQueue<ISignalMessage> {
        return this._inboundSignal;
    }

    public get initialSequenceNumber(): number {
        return this.initSequenceNumber;
    }

    public get lastSequenceNumber(): number {
        return this.lastProcessedSequenceNumber;
    }

    public get lastMessage() {
        return this.lastProcessedMessage;
    }

    public get lastKnownSeqNumber() {
        return this.lastObservedSeqNumber;
    }

    public get referenceTerm(): number {
        return this.baseTerm;
    }

    public get minimumSequenceNumber(): number {
        return this.minSequenceNumber;
    }

    public get maxMessageSize(): number {
        return this.connection?.serviceConfiguration?.maxMessageSize
            ?? this.connection?.maxMessageSize
            ?? DefaultChunkSize;
    }

    public get version(): string {
        if (this.connection === undefined) {
            throw new Error("Cannot check version without a connection");
        }
        return this.connection.version;
    }

    public get serviceConfiguration(): IClientConfiguration | undefined {
        return this.connection?.serviceConfiguration;
    }

    public get scopes(): string[] | undefined {
        return this.connection?.claims.scopes;
    }

    public get socketDocumentId(): string | undefined {
        return this.connection?.claims.documentId;
    }

    /**
     * The current connection mode, initially read.
     */
    public get connectionMode(): ConnectionMode {
        if (this.connection === undefined) {
            return "read";
        }
        return this.connection.mode;
    }

    /**
     * Tells if container is in read-only mode.
     * Data stores should listen for "readonly" notifications and disallow user
     * making changes to data stores.
     * Readonly state can be because of no storage write permission,
     * or due to host forcing readonly mode for container.
     * It is undefined if we have not yet established websocket connection
     * and do not know if user has write access to a file.
     * @deprecated - use readOnlyInfo
     */
    public get readonly() {
        if (this._forceReadonly) {
            return true;
        }
        return this._readonlyPermissions;
    }

    /**
     * Tells if user has no write permissions for file in storage
     * It is undefined if we have not yet established websocket connection
     * and do not know if user has write access to a file.
     * @deprecated - use readOnlyInfo
     */
    public get readonlyPermissions() {
        return this._readonlyPermissions;
    }

    public get readOnlyInfo(): ReadOnlyInfo {
        const storageOnly = this.connection !== undefined && this.connection instanceof NoDeltaStream;
        if (storageOnly || this._forceReadonly || this._readonlyPermissions === true) {
            return {
                readonly: true,
                forced: this._forceReadonly,
                permissions: this._readonlyPermissions,
                storageOnly,
            };
        }

        return { readonly: this._readonlyPermissions };
    }

    /**
     * Automatic reconnecting enabled or disabled.
     * If set to Never, then reconnecting will never be allowed.
     */
    public get reconnectMode(): ReconnectMode {
        return this._reconnectMode;
    }

    public shouldJoinWrite(): boolean {
        // We don't have to wait for ack for topmost NoOps. So subtract those.
        return this.clientSequenceNumberObserved < (this.clientSequenceNumber - this.trailingNoopCount);
    }

    /**
     * Enables or disables automatic reconnecting.
     * Will throw an error if reconnectMode set to Never.
     */
    public setAutomaticReconnect(reconnect: boolean): void {
        assert(
            this._reconnectMode !== ReconnectMode.Never,
            0x0e1 /* "Cannot toggle automatic reconnect if reconnect is set to Never." */);
        this._reconnectMode = reconnect ? ReconnectMode.Enabled : ReconnectMode.Disabled;
    }

    /**
     * Sends signal to runtime (and data stores) to be read-only.
     * Hosts may have read only views, indicating to data stores that no edits are allowed.
     * This is independent from this._readonlyPermissions (permissions) and this.connectionMode
     * (server can return "write" mode even when asked for "read")
     * Leveraging same "readonly" event as runtime & data stores should behave the same in such case
     * as in read-only permissions.
     * But this.active can be used by some DDSes to figure out if ops can be sent
     * (for example, read-only view still participates in code proposals / upgrades decisions)
     *
     * Forcing Readonly does not prevent DDS from generating ops. It is up to user code to honour
     * the readonly flag. If ops are generated, they will accumulate locally and not be sent. If
     * there are pending in the outbound queue, it will stop sending until force readonly is
     * cleared.
     *
     * @param readonly - set or clear force readonly.
     */
    public forceReadonly(readonly: boolean) {
        if (readonly !== this._forceReadonly) {
            this.logger.sendTelemetryEvent({
                eventName: "ForceReadOnly",
                value: readonly,
            });
        }
        const oldValue = this.readonly;
        this._forceReadonly = readonly;
        if (oldValue !== this.readonly) {
            let reconnect = false;
            if (this.readonly === true) {
                // If we switch to readonly while connected, we should disconnect first
                // See comment in the "readonly" event handler to deltaManager set up by
                // the ContainerRuntime constructor
                reconnect = this.disconnectFromDeltaStream("Force readonly");
            }
            safeRaiseEvent(this, this.logger, "readonly", this.readonly);
            if (reconnect) {
                // reconnect if we disconnected from before.
                this.triggerConnect({ reason: "forceReadonly", mode: "read", fetchOpsFromStorage: false });
            }
        }
    }

    private set_readonlyPermissions(readonly: boolean) {
        const oldValue = this.readonly;
        this._readonlyPermissions = readonly;
        if (oldValue !== this.readonly) {
            safeRaiseEvent(this, this.logger, "readonly", this.readonly);
        }
    }

    constructor(
        private readonly serviceProvider: () => IDocumentService | undefined,
        private client: IClient,
        private readonly logger: ITelemetryLogger,
        reconnectAllowed: boolean,
        private readonly _active: () => boolean,
    ) {
        super();

        this.clientDetails = this.client.details;
        this.defaultReconnectionMode = this.client.mode;
        this._reconnectMode = reconnectAllowed ? ReconnectMode.Enabled : ReconnectMode.Never;

        this._inbound = new DeltaQueue<ISequencedDocumentMessage>(
            (op) => {
                this.processInboundMessage(op);
            });

        this._inbound.on("error", (error) => {
            this.close(CreateProcessingError(error, this.lastMessage));
        });

        // Outbound message queue. The outbound queue is represented as a queue of an array of ops. Ops contained
        // within an array *must* fit within the maxMessageSize and are guaranteed to be ordered sequentially.
        this._outbound = new DeltaQueue<IDocumentMessage[]>(
            (messages) => {
                if (this.connection === undefined) {
                    throw new Error("Attempted to submit an outbound message without connection");
                }
                this.connection.submit(messages);
            });

        this._outbound.on("error", (error) => {
            this.close(CreateContainerError(error));
        });

        // Inbound signal queue
        this._inboundSignal = new DeltaQueue<ISignalMessage>((message) => {
            if (this.handler === undefined) {
                throw new Error("Attempted to process an inbound signal without a handler attached");
            }
            this.handler.processSignal({
                clientId: message.clientId,
                content: JSON.parse(message.content as string),
            });
        });

        this._inboundSignal.on("error", (error) => {
            this.close(CreateContainerError(error));
        });

        // Initially, all queues are created paused.
        // - outbound is flipped back and forth in setupNewSuccessfulConnection / disconnectFromDeltaStream
        // - inbound & inboundSignal are resumed in attachOpHandler() when we have handler setup
    }

    public dispose() {
        throw new Error("Not implemented.");
    }

    /**
     * Sets the sequence number from which inbound messages should be returned
     */
    public attachOpHandler(
        minSequenceNumber: number,
        sequenceNumber: number,
        term: number,
        handler: IDeltaHandlerStrategy,
    ) {
        this.initSequenceNumber = sequenceNumber;
        this.lastProcessedSequenceNumber = sequenceNumber;
        this.baseTerm = term;
        this.minSequenceNumber = minSequenceNumber;
        this.lastQueuedSequenceNumber = sequenceNumber;
        this.lastObservedSeqNumber = sequenceNumber;

        // We will use same check in other places to make sure all the seq number above are set properly.
        assert(this.handler === undefined, 0x0e2 /* "DeltaManager already has attached op handler!" */);
        this.handler = handler;
        // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
        assert(!!(this.handler as any), 0x0e3 /* "Newly set op handler is null/undefined!" */);

        this._inbound.resume();
        this._inboundSignal.resume();

        // We could have connected to delta stream before getting here
        // If so, it's time to process any accumulated ops, as there might be no other event that
        // will force these pending ops to be processed.
        // Or request OPs from snapshot / or point zero (if we have no ops at all)
        if (this.pending.length > 0) {
            this.processPendingOps("DocumentOpen");
        }
    }

    public async preFetchOps(cacheOnly: boolean) {
        // Note that might already got connected to delta stream by now.
        // If we did, then we proactively fetch ops at the end of setupNewSuccessfulConnection to ensure
        if (this.connection === undefined) {
            return this.fetchMissingDeltasCore("DocumentOpen", cacheOnly, this.lastQueuedSequenceNumber, undefined);
        }
    }

    private static detailsFromConnection(connection: IDocumentDeltaConnection): IConnectionDetails {
        return {
            claims: connection.claims,
            clientId: connection.clientId,
            existing: connection.existing,
            checkpointSequenceNumber: connection.checkpointSequenceNumber,
            get initialClients() { return connection.initialClients; },
            maxMessageSize: connection.maxMessageSize,
            mode: connection.mode,
            serviceConfiguration: connection.serviceConfiguration,
            version: connection.version,
        };
    }

    public async connect(args: IConnectionArgs): Promise<IConnectionDetails> {
        const connection = await this.connectCore(args);
        return DeltaManager.detailsFromConnection(connection);
    }

    /**
     * Start the connection. Any error should result in container being close.
     * And report the error if it excape for any reason.
     * @param args - The connection arguments
     */
    private triggerConnect(args: IConnectionArgs) {
        this.connectCore(args).catch((err) => {
            // Errors are raised as "error" event and close container.
            // Have a catch-all case in case we missed something
            if (!this.closed) {
                this.logger.sendErrorEvent({ eventName: "ConnectException" }, err);
            }
        });
    }

    private async connectCore(args: IConnectionArgs): Promise<IDocumentDeltaConnection> {
        if (this.connection !== undefined) {
            return this.connection;
        }

        if (this.connectionP !== undefined) {
            return this.connectionP;
        }

        const fetchOpsFromStorage = args.fetchOpsFromStorage ?? true;
        let requestedMode = args.mode ?? this.defaultReconnectionMode;

        // if we have any non-acked ops from last connection, reconnect as "write".
        // without that we would connect in view-only mode, which will result in immediate
        // firing of "connected" event from Container and switch of current clientId (as tracked
        // by all DDSes). This will make it impossible to figure out if ops actually made it through,
        // so DDSes will immediately resubmit all pending ops, and some of them will be duplicates, corrupting document
        if (this.shouldJoinWrite()) {
            requestedMode = "write";
        }

        // Note: There is race condition here.
        // We want to issue request to storage as soon as possible, to
        // reduce latency of becoming current, thus this code here.
        // But there is no ordering between fetching OPs and connection to delta stream
        // As result, we might be behind by the time we connect to delta stream
        // In case of r/w connection, that's not an issue, because we will hear our
        // own "join" message and realize any gap client has in ops.
        // But for view-only connection, we have no such signal, and with no traffic
        // on the wire, we might be always behind.
        // See comment at the end of setupNewSuccessfulConnection()
        logIfFalse(
            this.handler !== undefined || !fetchOpsFromStorage,
            this.logger,
            "CantFetchWithoutBaseline"); // can't fetch if no baseline
        if (fetchOpsFromStorage && this.handler !== undefined) {
            this.fetchMissingDeltas(args.reason, this.lastQueuedSequenceNumber);
        }

        const docService = this.serviceProvider();
        if (docService === undefined) {
            throw new Error("Container is not attached");
        }

        if (docService.policies?.storageOnly === true) {
            const connection = new NoDeltaStream();
            this.connectionP = new Promise((resolve) => {
                this.setupNewSuccessfulConnection(connection, "read");
                resolve(connection);
            });
            return this.connectionP;
        }

        // The promise returned from connectCore will settle with a resolved connection or reject with error
        const connectCore = async () => {
            let connection: IDocumentDeltaConnection | undefined;
            let delayMs = InitialReconnectDelayInMs;
            let connectRepeatCount = 0;
            const connectStartTime = performance.now();

            // This loop will keep trying to connect until successful, with a delay between each iteration.
            while (connection === undefined) {
                if (this.closed) {
                    throw new Error("Attempting to connect a closed DeltaManager");
                }
                connectRepeatCount++;

                try {
                    this.client.mode = requestedMode;
                    connection = await docService.connectToDeltaStream(this.client);
                } catch (origError) {
                    if (typeof origError === "object" && origError !== null &&
                        origError?.errorType === DeltaStreamConnectionForbiddenError.errorType) {
                        connection = new NoDeltaStream();
                        requestedMode = "read";
                        break;
                    }

                    // Socket.io error when we connect to wrong socket, or hit some multiplexing bug
                    if (!canRetryOnError(origError)) {
                        const error = CreateContainerError(origError);
                        this.close(error);
                        // eslint-disable-next-line @typescript-eslint/no-throw-literal
                        throw error;
                    }

                    // Log error once - we get too many errors in logs when we are offline,
                    // and unfortunately there is no reliable way to detect that.
                    if (connectRepeatCount === 1) {
                        logNetworkFailure(
                            this.logger,
                            {
                                delay: delayMs, // milliseconds
                                eventName: "DeltaConnectionFailureToConnect",
                            },
                            origError);
                    }

                    const retryDelayFromError = getRetryDelayFromError(origError);
                    delayMs = retryDelayFromError ?? Math.min(delayMs * 2, MaxReconnectDelayInMs);

                    if (retryDelayFromError !== undefined) {
                        this.emitDelayInfo(this.deltaStreamDelayId, retryDelayFromError, origError);
                    }
                    await waitForConnectedState(delayMs);
                }
            }

            // If we retried more than once, log an event about how long it took
            if (connectRepeatCount > 1) {
                this.logger.sendTelemetryEvent({
                    attempts: connectRepeatCount,
                    duration: TelemetryLogger.formatTick(performance.now() - connectStartTime),
                    eventName: "MultipleDeltaConnectionFailures",
                });
            }

            this.setupNewSuccessfulConnection(connection, requestedMode);

            return connection;
        };

        // This promise settles as soon as we know the outcome of the connection attempt
        this.connectionP = new Promise((resolve, reject) => {
            // Regardless of how the connection attempt concludes, we'll clear the promise and remove the listener

            // Reject the connection promise if the DeltaManager gets closed during connection
            const cleanupAndReject = (error) => {
                this.connectionP = undefined;
                this.removeListener("closed", cleanupAndReject);
                reject(error);
            };
            this.on("closed", cleanupAndReject);

            // Attempt the connection
            connectCore().then((connection) => {
                this.connectionP = undefined;
                this.removeListener("closed", cleanupAndReject);
                resolve(connection);
            }).catch(cleanupAndReject);
        });

        return this.connectionP;
    }

    public flush() {
        if (this.messageBuffer.length === 0) {
            return;
        }

        // The prepareFlush event allows listeners to append metadata to the batch prior to submission.
        this.emit("prepareSend", this.messageBuffer);

        this._outbound.push(this.messageBuffer);
        this.messageBuffer = [];
    }

    /**
     * Submits the given delta returning the client sequence number for the message. Contents is the actual
     * contents of the message. appData is optional metadata that can be attached to the op by the app.
     *
     * If batch is set to true then the submit will be batched - and as a result guaranteed to be ordered sequentially
     * in the global sequencing space. The batch will be flushed either when flush is called or when a non-batched
     * op is submitted.
     */
    public submit(type: MessageType, contents: any, batch = false, metadata?: any): number {
        // TODO need to fail if gets too large
        // const serializedContent = JSON.stringify(this.messageBuffer);
        // const maxOpSize = this.context.deltaManager.maxMessageSize;

        if (this.readonly === true) {
            assert(this.readOnlyInfo.readonly === true, 0x1f0 /* "Unexpected mismatch in readonly" */);
            const error = CreateContainerError("Op is sent in read-only document state", {
                readonly: this.readOnlyInfo.readonly,
                forcedReadonly: this.readOnlyInfo.forced,
                readonlyPermissions: this.readOnlyInfo.permissions,
                storageOnly: this.readOnlyInfo.storageOnly,
            });
            this.close(error);
            return -1;
        }

        // reset clientSequenceNumber if we are using new clientId.
        // we keep info about old connection as long as possible to be able to account for all non-acked ops
        // that we pick up on next connection.
        assert(!!this.connection, 0x0e4 /* "Lost old connection!" */);
        if (this.lastSubmittedClientId !== this.connection?.clientId) {
            this.lastSubmittedClientId = this.connection?.clientId;
            this.clientSequenceNumber = 0;
            this.clientSequenceNumberObserved = 0;
        }

        const service = this.clientDetails.type === undefined || this.clientDetails.type === ""
            ? "unknown"
            : this.clientDetails.type;

        // Start adding trace for the op.
        const traces: ITrace[] = [
            {
                action: "start",
                service,
                timestamp: Date.now(),
            }];

        const message: IDocumentMessage = {
            clientSequenceNumber: ++this.clientSequenceNumber,
            contents: JSON.stringify(contents),
            metadata,
            referenceSequenceNumber: this.lastProcessedSequenceNumber,
            traces,
            type,
        };

        if (type === MessageType.NoOp) {
            this.trailingNoopCount++;
        } else {
            this.trailingNoopCount = 0;
        }

        this.emit("submitOp", message);

        if (!batch) {
            this.flush();
            this.messageBuffer.push(message);
            this.flush();
        } else {
            this.messageBuffer.push(message);
        }

        return message.clientSequenceNumber;
    }

    public submitSignal(content: any) {
        if (this.connection !== undefined) {
            this.connection.submitSignal(content);
        } else {
            this.logger.sendErrorEvent({ eventName: "submitSignalDisconnected" });
        }
    }

    private async getDeltas(
        from: number, // inclusive
        to: number | undefined, // exclusive
        callback: (messages: ISequencedDocumentMessage[]) => void,
        cacheOnly: boolean)
    {
        const docService = this.serviceProvider();
        if (docService === undefined) {
            throw new Error("Delta manager is not attached");
        }

        if (this.deltaStorage === undefined) {
            this.deltaStorage = await docService.connectToDeltaStorage();
        }

        let controller = this.closeAbortController;
        let listenerToClear: ((op: ISequencedDocumentMessage) => void) | undefined;

        if (to !== undefined) {
            controller = new AbortController();

            assert(this.closeAbortController.signal.onabort === null, 0x1e8 /* "reentrancy" */);
            this.closeAbortController.signal.onabort = () => controller.abort();

            const listener = (op: ISequencedDocumentMessage) => {
                // Be prepared for the case where webSocket would receive the ops that we are trying to fill through
                // storage. Ideally it should never happen (i.e. ops on socket are always ordered, and thus once we
                // detected gap, this gap can't be filled in later on through websocket).
                // And in practice that does look like the case. The place where this code gets hit is if we lost
                // connection and reconnected (likely to another box), and new socket's initial ops contains these ops.
                if (op.sequenceNumber >= to) {
                    this.logger.sendPerformanceEvent({
                        reason: this.fetchReason,
                        eventName: "ExtraStorageCall",
                        from,
                        to,
                        ...this.connectionStateProps,
                    });
                    controller.abort();
                    this._inbound.off("push", listener);
                }
            };
            this._inbound.on("push", listener);
            listenerToClear = listener;
        }

        try {
            const stream = this.deltaStorage.fetchMessages(
                from, // inclusive
                to, // exclusive
                controller.signal,
                cacheOnly);

            // eslint-disable-next-line no-constant-condition
            while (true) {
                const result = await stream.read();
                if (result.done) {
                    break;
                }
                callback(result.value);
            }
        } finally {
            this.closeAbortController.signal.onabort = null;
            if (listenerToClear !== undefined) {
                this._inbound.off("push", listenerToClear);
            }
        }
    }

    /**
     * Closes the connection and clears inbound & outbound queues.
     */
    public close(error?: ICriticalContainerError): void {
        if (this.closed) {
            return;
        }
        this.closed = true;

        this.closeAbortController.abort();

        // This raises "disconnect" event if we have active connection.
        this.disconnectFromDeltaStream(error !== undefined ? `${error.message}` : "Container closed");

        this._inbound.clear();
        this._outbound.clear();
        this._inboundSignal.clear();

        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        this._inbound.pause();
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        this._inboundSignal.pause();

        // Drop pending messages - this will ensure catchUp() does not go into infinite loop
        this.pending = [];

        // Notify everyone we are in read-only state.
        // Useful for data stores in case we hit some critical error,
        // to switch to a mode where user edits are not accepted
        this.set_readonlyPermissions(true);

        // This needs to be the last thing we do (before removing listeners), as it causes
        // Container to dispose context and break ability of data stores / runtime to "hear"
        // from delta manager, including notification (above) about readonly state.
        this.emit("closed", error);

        this.removeAllListeners();
    }

    public refreshDelayInfo(id: string) {
        this.throttlingIdSet.delete(id);
        if (this.throttlingIdSet.size === 0) {
            this.timeTillThrottling = 0;
        }
    }

    /**
     * Emit info about a delay in service communication on account of throttling.
     * @param id - Id of the connection that is delayed
     * @param delayMs - Duration of the delay
     * @param error - error objecct indicating the throttling
     */
    public emitDelayInfo(id: string, delayMs: number, error: unknown) {
        const timeNow = Date.now();
        this.throttlingIdSet.add(id);
        if (delayMs > 0 && (timeNow + delayMs > this.timeTillThrottling)) {
            this.timeTillThrottling = timeNow + delayMs;

            const throttlingWarning: IThrottlingWarning =
                ThrottlingWarning.wrap(error, "Service busy/throttled", delayMs / 1000 /* retryAfterSeconds */);
            this.emit("throttled", throttlingWarning);
        }
    }

    private readonly opHandler = (documentId: string, messagesArg: ISequencedDocumentMessage[]) => {
        const messages = Array.isArray(messagesArg) ? messagesArg : [messagesArg];
        this.enqueueMessages(messages, "opHandler");
    };

    private readonly signalHandler = (message: ISignalMessage) => {
        this._inboundSignal.push(message);
    };

    // Always connect in write mode after getting nacked.
    private readonly nackHandler = (documentId: string, messages: INack[]) => {
        const message = messages[0];
        // TODO: we should remove this check when service updates?
        // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
        if (this._readonlyPermissions) {
            this.close(createWriteError("WriteOnReadOnlyDocument"));
        }

        // check message.content for Back-compat with old service.
        const reconnectInfo = message.content !== undefined
            ? getNackReconnectInfo(message.content) :
            createGenericNetworkError(`Nack: unknown reason`, true);

        if (this.reconnectMode !== ReconnectMode.Enabled) {
            this.logger.sendErrorEvent({
                eventName: "NackWithNoReconnect",
                reason: reconnectInfo.message,
                mode: this.connectionMode,
            });
        }

        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        this.reconnectOnError(
            "write",
            reconnectInfo,
        );
    };

    // Connection mode is always read on disconnect/error unless the system mode was write.
    private readonly disconnectHandler = (disconnectReason) => {
        // Note: we might get multiple disconnect calls on same socket, as early disconnect notification
        // ("server_disconnect", ODSP-specific) is mapped to "disconnect"
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        this.reconnectOnError(
            this.defaultReconnectionMode,
            createReconnectError("Disconnect", disconnectReason),
        );
    };

    private readonly errorHandler = (error) => {
        // Observation based on early pre-production telemetry:
        // We are getting transport errors from WebSocket here, right before or after "disconnect".
        // This happens only in Firefox.
        logNetworkFailure(this.logger, { eventName: "DeltaConnectionError" }, error);
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        this.reconnectOnError(
            this.defaultReconnectionMode,
            createReconnectError("error", error),
        );
    };

    private readonly pongHandler = (latency: number) => {
        this.emit("pong", latency);
    };

    /**
     * Once we've successfully gotten a connection, we need to set up state, attach event listeners, and process
     * initial messages.
     * @param connection - The newly established connection
     */
    private setupNewSuccessfulConnection(connection: IDocumentDeltaConnection, requestedMode: ConnectionMode) {
        // Old connection should have been cleaned up before establishing a new one
        assert(this.connection === undefined, 0x0e6 /* "old connection exists on new connection setup" */);
        this.connection = connection;

        // Does information in scopes & mode matches?
        // If we asked for "write" and got "read", then file is read-only
        // But if we ask read, server can still give us write.
        const readonly = !connection.claims.scopes.includes(ScopeType.DocWrite);
        assert(requestedMode === "read" || readonly === (this.connectionMode === "read"),
            0x0e7 /* "claims/connectionMode mismatch" */);
        assert(!readonly || this.connectionMode === "read", 0x0e8 /* "readonly perf with write connection" */);
        this.set_readonlyPermissions(readonly);

        this.refreshDelayInfo(this.deltaStreamDelayId);

        if (this.closed) {
            // Raise proper events, Log telemetry event and close connection.
            this.disconnectFromDeltaStream(`Disconnect on close`);
            return;
        }

        // We cancel all ops on lost of connectivity, and rely on DDSes to resubmit them.
        // Semantics are not well defined for batches (and they are broken right now on disconnects anyway),
        // but it's safe to assume (until better design is put into place) that batches should not exist
        // across multiple connections. Right now we assume runtime will not submit any ops in disconnected
        // state. As requirements change, so should these checks.
        assert(this.messageBuffer.length === 0, 0x0e9 /* "messageBuffer is not empty on new connection" */);

        this._outbound.resume();

        connection.on("op", this.opHandler);
        connection.on("signal", this.signalHandler);
        connection.on("nack", this.nackHandler);
        connection.on("disconnect", this.disconnectHandler);
        connection.on("error", this.errorHandler);
        connection.on("pong", this.pongHandler);

        // Initial messages are always sorted. However, due to early op handler installed by drivers and appending those
        // ops to initialMessages, resulting set is no longer sorted, which would result in client hitting storage to
        // fill in gap. We will recover by cancelling this request once we process remaining ops, but it's a waste that
        // we could avoid
        const initialMessages = connection.initialMessages.sort((a, b) => a.sequenceNumber - b.sequenceNumber);

        this.connectionStateProps = {
            connectionLastQueuedSequenceNumber : this.lastQueuedSequenceNumber,
            connectionLastObservedSeqNumber: this.lastObservedSeqNumber,
            clientId: connection.clientId,
            mode: connection.mode,
        };
        this._hasCheckpointSequenceNumber = false;

        // Some storages may provide checkpointSequenceNumber to identify how far client is behind.
        const checkpointSequenceNumber = connection.checkpointSequenceNumber;
        if (checkpointSequenceNumber !== undefined) {
            this._hasCheckpointSequenceNumber = true;
            this.updateLatestKnownOpSeqNumber(checkpointSequenceNumber);
        }

        // Update knowledge of how far we are behind, before raising "connect" event
        // This is duplication of what enqueueMessages() does, but we have to raise event before we get there,
        // so duplicating update logic here as well.
        const last = initialMessages.length > 0 ? initialMessages[initialMessages.length - 1].sequenceNumber : -1;
        if (initialMessages.length > 0) {
            this._hasCheckpointSequenceNumber = true;
            this.updateLatestKnownOpSeqNumber(last);
        }

        // Notify of the connection
        // WARNING: This has to happen before processInitialMessages() call below.
        // If not, we may not update Container.pendingClientId in time before seeing our own join session op.
        this.emit(
            "connect",
            DeltaManager.detailsFromConnection(connection),
            this._hasCheckpointSequenceNumber ? this.lastObservedSeqNumber - this.lastSequenceNumber : undefined);

        this.enqueueMessages(
            initialMessages,
            this.connectFirstConnection ? "InitialOps" : "ReconnectOps");

        if (connection.initialSignals !== undefined) {
            for (const signal of connection.initialSignals) {
                this._inboundSignal.push(signal);
            }
        }

        // If we got some initial ops, then we know the gap and call above fetched ops to fill it.
        // Same is true for "write" mode even if we have no ops - we will get self "join" ops very very soon.
        // However if we are connecting as view-only, then there is no good signal to realize if client is behind.
        // Thus we have to hit storage to see if any ops are there.
        if (initialMessages.length === 0) {
            if (checkpointSequenceNumber !== undefined) {
                // We know how far we are behind (roughly). If it's non-zero gap, fetch ops right away.
                if (checkpointSequenceNumber > this.lastQueuedSequenceNumber) {
                    this.fetchMissingDeltas("AfterConnection", this.lastQueuedSequenceNumber);
                }
            // we do not know the gap, and we will not learn about it if socket is quite - have to ask.
            } else if (connection.mode !== "write") {
                this.fetchMissingDeltas("AfterConnection", this.lastQueuedSequenceNumber);
            }
        } else {
            this.connectionStateProps.connectionInitialOpsFrom = initialMessages[0].sequenceNumber;
            this.connectionStateProps.connectionInitialOpsTo = last + 1;
        }

        this.connectFirstConnection = false;
    }

    /**
     * Disconnect the current connection.
     * @param reason - Text description of disconnect reason to emit with disconnect event
     */
    private disconnectFromDeltaStream(reason: string) {
        if (this.connection === undefined) {
            return false;
        }

        const connection = this.connection;
        // Avoid any re-entrancy - clear object reference
        this.connection = undefined;

        // Remove listeners first so we don't try to retrigger this flow accidentally through reconnectOnError
        connection.off("op", this.opHandler);
        connection.off("signal", this.signalHandler);
        connection.off("nack", this.nackHandler);
        connection.off("disconnect", this.disconnectHandler);
        connection.off("error", this.errorHandler);
        connection.off("pong", this.pongHandler);

        // We cancel all ops on lost of connectivity, and rely on DDSes to resubmit them.
        // Semantics are not well defined for batches (and they are broken right now on disconnects anyway),
        // but it's safe to assume (until better design is put into place) that batches should not exist
        // across multiple connections. Right now we assume runtime will not submit any ops in disconnected
        // state. As requirements change, so should these checks.
        assert(this.messageBuffer.length === 0, 0x0ea /* "messageBuffer is not empty on disconnect" */);

        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        this._outbound.pause();
        this._outbound.clear();
        this.emit("disconnect", reason);

        connection.close();
        this.connectionStateProps = {};

        return true;
    }

    /**
     * Disconnect the current connection and reconnect.
     * @param connection - The connection that wants to reconnect - no-op if it's different from this.connection
     * @param requestedMode - Read or write
     * @param error - Error reconnect information including whether or not to reconnect
     * @returns A promise that resolves when the connection is reestablished or we stop trying
     */
    private async reconnectOnError(
        requestedMode: ConnectionMode,
        error: DriverError,
    ) {
        // We quite often get protocol errors before / after observing nack/disconnect
        // we do not want to run through same sequence twice.
        // If we're already disconnected/disconnecting it's not appropriate to call this again.
        assert(this.connection !== undefined, 0x0eb /* "Missing connection for reconnect" */);

        this.disconnectFromDeltaStream(error.message);

        // If reconnection is not an option, close the DeltaManager
        const canRetry = canRetryOnError(error);
        if (this.reconnectMode === ReconnectMode.Never || !canRetry) {
            // Do not raise container error if we are closing just because we lost connection.
            // Those errors (like IdleDisconnect) would show up in telemetry dashboards and
            // are very misleading, as first initial reaction - some logic is broken.
            this.close(canRetry ? undefined : error);
        }

        // If closed then we can't reconnect
        if (this.closed) {
            return;
        }

        if (this.reconnectMode === ReconnectMode.Enabled) {
            const delayMs = getRetryDelayFromError(error);
            if (delayMs !== undefined) {
                this.emitDelayInfo(this.deltaStreamDelayId, delayMs, error);
                await waitForConnectedState(delayMs);
            }

            this.triggerConnect({ reason: "reconnect", mode: requestedMode, fetchOpsFromStorage: false });
        }
    }

    // returns parts of message (in string format) that should never change for a given message.
    // Used for message comparison. It attempts to avoid comparing fields that potentially may differ.
    // for example, it's not clear if serverMetadata or timestamp property is a property of message or server state.
    // We only extract the most obvious fields that are sufficient (with high probability) to detect sequence number
    // reuse.
    // Also payload goes to telemetry, so no PII, including content!!
    // Note: It's possible for a duplicate op to be broadcasted and have everything the same except the timestamp.
    private comparableMessagePayload(m: ISequencedDocumentMessage) {
        return `${m.clientId}-${m.type}-${m.minimumSequenceNumber}-${m.referenceSequenceNumber}-${m.timestamp}`;
    }

    private enqueueMessages(
        messages: ISequencedDocumentMessage[],
        reason: string,
        allowGaps = false,
    ): void {
        if (this.handler === undefined) {
            // We did not setup handler yet.
            // This happens when we connect to web socket faster than we get attributes for container
            // and thus faster than attachOpHandler() is called
            // this.lastProcessedSequenceNumber is still zero, so we can't rely on this.fetchMissingDeltas()
            // to do the right thing.
            this.pending = this.pending.concat(messages);
            return;
        }

        // Pending ops should never just hang around for nothing.
        // This invariant will stay true through this function execution,
        // so there is no need to process pending ops here.
        // It's responsibility of
        // - attachOpHandler()
        // - fetchMissingDeltas() after it's done with querying storage
        assert(this.pending.length === 0 || this.fetchReason !== undefined, 0x1e9 /* "Pending ops" */);

        if (messages.length === 0) {
            return;
        }

        const from = messages[0].sequenceNumber;
        const last = messages[messages.length - 1].sequenceNumber;

        // Report stats about missing and duplicate ops
        // This helps better understand why we fetch ops from storage, and thus may delay
        // getting current / sending ops
        // It's possible that this batch is already too late - do not bother
        if (last > this.lastQueuedSequenceNumber) {
            let prev = from - 1;
            const initialGap = prev - this.lastQueuedSequenceNumber;
            let firstMissing: number | undefined;
            let duplicate = 0;
            let gap = 0;

            // Count all gaps and duplicates
            for (const message of messages) {
                if (message.sequenceNumber === prev) {
                    duplicate++;
                } else if (message.sequenceNumber !== prev + 1) {
                    gap++;
                    if (firstMissing === undefined) {
                        firstMissing = prev + 1;
                    }
                }
                prev = message.sequenceNumber;
            }

            let eventName: string | undefined;

            // Report if we found some issues
            if (duplicate !== 0 || gap !== 0 && !allowGaps || initialGap > 0 && this.fetchReason === undefined) {
                eventName = "enqueueMessages";
            // Also report if we are fetching ops, and same range comes in, thus making this fetch obsolete.
            } else if (this.fetchReason !== undefined && this.fetchReason !== reason &&
                    (from <= this.lastQueuedSequenceNumber + 1 && last > this.lastQueuedSequenceNumber)) {
                eventName = "enqueueMessagesExtraFetch";
            }

            // Report if there is something to report
            // Do not report when pending fetch is in progress, as such reporting will not
            // correctly take into account pending ops.
            if (eventName !== undefined) {
                this.logger.sendPerformanceEvent({
                    eventName,
                    reason,
                    previousReason: this.prevEnqueueMessagesReason,
                    from,
                    to: last + 1, // exclusive, being consistent with the other telemetry / APIs
                    length: messages.length,
                    fetchReason: this.fetchReason,
                    duplicate: duplicate > 0 ? duplicate : undefined,
                    initialGap: initialGap !== 0 ? initialGap : undefined,
                    gap: gap > 0 ? gap : undefined,
                    firstMissing,
                    dmInitialSeqNumber: this.initialSequenceNumber,
                    ...this.connectionStateProps,
                });
            }
        }

        this.updateLatestKnownOpSeqNumber(messages[messages.length - 1].sequenceNumber);

        const n = this.previouslyProcessedMessage?.sequenceNumber;
        assert(n === undefined || n === this.lastQueuedSequenceNumber,
            0x0ec /* "Unexpected value for previously processed message's sequence number" */);

        for (const message of messages) {
            // Check that the messages are arriving in the expected order
            if (message.sequenceNumber <= this.lastQueuedSequenceNumber) {
                // Validate that we do not have data loss, i.e. sequencing is reset and started again
                // with numbers that this client already observed before.
                if (this.previouslyProcessedMessage?.sequenceNumber === message.sequenceNumber) {
                    const message1 = this.comparableMessagePayload(this.previouslyProcessedMessage);
                    const message2 = this.comparableMessagePayload(message);
                    if (message1 !== message2) {
                        const error = new NonRetryableError(
                            "Two messages with same seq# and different payload!",
                            DriverErrorType.fileOverwrittenInStorage,
                            {
                                clientId: this.connection?.clientId,
                                sequenceNumber: message.sequenceNumber,
                                message1,
                                message2,
                            },
                        );
                        this.close(error);
                    }
                }
            } else if (message.sequenceNumber !== this.lastQueuedSequenceNumber + 1) {
                this.pending.push(message);
                this.fetchMissingDeltas(reason, this.lastQueuedSequenceNumber, message.sequenceNumber);
            } else {
                this.lastQueuedSequenceNumber = message.sequenceNumber;
                this.previouslyProcessedMessage = message;
                this._inbound.push(message);
            }
        }

        // When / if we report a gap in ops in the future, we want telemetry to correctly reflect source
        // of prior ops. But if we have some out of order ops (this.pending), then reporting current reason
        // becomes not accurate, as the gap existed before current batch, so we should just report "unknown".
        this.prevEnqueueMessagesReason = this.pending.length > 0 ? "unknown" : reason;
    }

    private processInboundMessage(message: ISequencedDocumentMessage): void {
        const startTime = Date.now();
        this.lastProcessedMessage = message;

        // All non-system messages are coming from some client, and should have clientId
        // System messages may have no clientId (but some do, like propose, noop, summarize)
        assert(
            message.clientId !== undefined
            || isSystemMessage(message),
            0x0ed /* "non-system message have to have clientId" */,
        );

        // if we have connection, and message is local, then we better treat is as local!
        assert(
            this.connection === undefined
            || this.connection.clientId !== message.clientId
            || this.lastSubmittedClientId === message.clientId,
            0x0ee /* "Not accounting local messages correctly" */,
        );

        if (this.lastSubmittedClientId !== undefined && this.lastSubmittedClientId === message.clientId) {
            const clientSequenceNumber = message.clientSequenceNumber;

            assert(this.clientSequenceNumberObserved < clientSequenceNumber, 0x0ef /* "client seq# not growing" */);
            assert(clientSequenceNumber <= this.clientSequenceNumber,
                0x0f0 /* "Incoming local client seq# > generated by this client" */);

            this.clientSequenceNumberObserved = clientSequenceNumber;
        }

        // TODO Remove after SPO picks up the latest build.
        if (
            typeof message.contents === "string"
            && message.contents !== ""
            && message.type !== MessageType.ClientLeave
        ) {
            message.contents = JSON.parse(message.contents);
        }

        // Add final ack trace.
        if (message.traces !== undefined && message.traces.length > 0) {
            const service = this.clientDetails.type === undefined || this.clientDetails.type === ""
                ? "unknown"
                : this.clientDetails.type;
            message.traces.push({
                action: "end",
                service,
                timestamp: Date.now(),
            });
        }

        // Watch the minimum sequence number and be ready to update as needed
        if (this.minSequenceNumber > message.minimumSequenceNumber) {
            throw new DataCorruptionError("msn moves backwards", {
                ...extractLogSafeMessageProperties(message),
                clientId: this.connection?.clientId,
            });
        }
        this.minSequenceNumber = message.minimumSequenceNumber;

        if (message.sequenceNumber !== this.lastProcessedSequenceNumber + 1) {
            throw new DataCorruptionError("non-seq seq#", {
                ...extractLogSafeMessageProperties(message),
                clientId: this.connection?.clientId,
            });
        }
        this.lastProcessedSequenceNumber = message.sequenceNumber;

        // Back-compat for older server with no term
        if (message.term === undefined) {
            message.term = 1;
        }
        this.baseTerm = message.term;

        if (this.handler === undefined) {
            throw new Error("Attempted to process an inbound message without a handler attached");
        }
        this.handler.process(message);

        const endTime = Date.now();
        this.emit("op", message, endTime - startTime);
    }

    /**
     * Retrieves the missing deltas between the given sequence numbers
     */
     private fetchMissingDeltas(reasonArg: string, lastKnowOp: number, to?: number) {
         // eslint-disable-next-line @typescript-eslint/no-floating-promises
         this.fetchMissingDeltasCore(reasonArg, false /* cacheOnly */, lastKnowOp, to);
     }

     /**
     * Retrieves the missing deltas between the given sequence numbers
     */
    private async fetchMissingDeltasCore(
        reason: string,
        cacheOnly: boolean,
        lastKnowOp: number,
        to?: number)
    {
        // Exit out early if we're already fetching deltas
        if (this.fetchReason !== undefined) {
            return;
        }

        if (this.closed) {
            this.logger.sendTelemetryEvent({ eventName: "fetchMissingDeltasClosedConnection" });
            return;
        }

        try {
            assert(lastKnowOp === this.lastQueuedSequenceNumber, 0x0f1 /* "from arg" */);
            let from = lastKnowOp + 1;

            const n = this.previouslyProcessedMessage?.sequenceNumber;
            if (n !== undefined) {
                // If we already processed at least one op, then we have this.previouslyProcessedMessage populated
                // and can use it to validate that we are operating on same file, i.e. it was not overwritten.
                // Knowing about this mechanism, we could ask for op we already observed to increase validation.
                // This is especially useful when coming out of offline mode or loading from
                // very old cached (by client / driver) snapshot.
                assert(n === lastKnowOp, 0x0f2 /* "previouslyProcessedMessage" */);
                assert(from > 1, 0x0f3 /* "not positive" */);
                from--;
            }

            const fetchReason = `${reason}_fetch`;
            this.fetchReason = fetchReason;

            await this.getDeltas(
                from,
                to,
                (messages) => {
                    this.refreshDelayInfo(this.deltaStorageDelayId);
                    this.enqueueMessages(messages, fetchReason);
                },
                cacheOnly);
        } catch (error) {
            this.logger.sendErrorEvent({eventName: "GetDeltas_Exception"}, error);
            this.close(CreateContainerError(error));
        } finally {
            this.refreshDelayInfo(this.deltaStorageDelayId);
            this.fetchReason = undefined;
            this.processPendingOps(reason);
        }
    }

    /**
     * Sorts pending ops and attempts to apply them
     */
    private processPendingOps(reason?: string): void {
        if (this.handler !== undefined) {
            const pendingSorted = this.pending.sort((a, b) => a.sequenceNumber - b.sequenceNumber);
            this.pending = [];
            // Given that we do not track where these ops came from any more, it's not very
            // actionably to report gaps in this range.
            this.enqueueMessages(pendingSorted, `${reason}_pending`, true /* allowGaps */);
        }
    }

    private updateLatestKnownOpSeqNumber(seq: number) {
        if (this.lastObservedSeqNumber < seq) {
            this.lastObservedSeqNumber = seq;
        }
    }
}

// TODO: move this elsewhere and use it more broadly for DataCorruptionError/DataProcessingError
function extractLogSafeMessageProperties(message: Partial<ISequencedDocumentMessage>) {
    const safeProps = {
        messageClientId: message.clientId,
        sequenceNumber: message.sequenceNumber,
        clientSequenceNumber: message.clientSequenceNumber,
        referenceSequenceNumber: message.referenceSequenceNumber,
        minimumSequenceNumber: message.minimumSequenceNumber,
        messageTimestamp: message.timestamp,
    };

    return safeProps;
}
