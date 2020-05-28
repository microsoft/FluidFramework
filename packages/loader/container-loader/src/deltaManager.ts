/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "assert";
import { ITelemetryLogger, IEventProvider } from "@fluidframework/common-definitions";
import {
    IConnectionDetails,
    IDeltaHandlerStrategy,
    IDeltaManager,
    IDeltaManagerEvents,
    IDeltaQueue,
    CriticalContainerError,
    IThrottlingWarning,
    ErrorType,
} from "@fluidframework/container-definitions";
import { PerformanceEvent, performanceNow, TelemetryLogger, TypedEventEmitter } from "@fluidframework/common-utils";
import {
    IDocumentDeltaStorageService,
    IDocumentService,
} from "@fluidframework/driver-definitions";
import { isSystemType, isSystemMessage } from "@fluidframework/protocol-base";
import {
    ConnectionMode,
    IClient,
    IClientDetails,
    IContentMessage,
    IDocumentMessage,
    IDocumentSystemMessage,
    INack,
    INackContent,
    ISequencedDocumentMessage,
    IServiceConfiguration,
    ISignalMessage,
    ITrace,
    MessageType,
    ScopeType,
} from "@fluidframework/protocol-definitions";
import {
    CreateContainerError,
    createWriteError,
    createGenericNetworkError,
} from "@fluidframework/driver-utils";
import { ContentCache } from "./contentCache";
import { debug } from "./debug";
import { DeltaConnection } from "./deltaConnection";
import { DeltaQueue } from "./deltaQueue";
import { logNetworkFailure, waitForConnectedState } from "./networkUtils";

const MaxReconnectDelaySeconds = 8;
const InitialReconnectDelaySeconds = 1;
const MissingFetchDelaySeconds = 0.1;
const MaxFetchDelaySeconds = 10;
const MaxBatchDeltas = 2000;
const DefaultChunkSize = 16 * 1024;

// This can be anything other than null
const ImmediateNoOpResponse = "";

const DefaultContentBufferSize = 10;

// Test if we deal with NetworkError object and if it has enough information to make a call.
// If in doubt, allow retries.
const canRetryOnError = (error: any): boolean => error?.canRetry !== false;
const getRetryDelayFromError = (error: any): number | undefined => error?.retryAfterSeconds || undefined;

function getNackReconnectInfo(nackContent: INackContent): CriticalContainerError {
    const reason = `Nack: ${nackContent.message}`;
    const canRetry = ![403, 429].includes(nackContent.code);
    return createGenericNetworkError(reason, canRetry, nackContent.retryAfter);
}

function createReconnectError(prefix: string, err: any) {
    const error = CreateContainerError(err, true);
    const error2 = Object.create(error);
    error2.message = `${prefix}: ${error.message}`;
    return error2;
}

enum RetryFor {
    DeltaStream,
    DeltaStorage,
}

export interface IConnectionArgs {
    mode?: ConnectionMode;
    fetchOpsFromStorage?: boolean;
    reason?: string;
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
    (event: "closed", listener: (error?: CriticalContainerError) => void);
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
    public get disposed() { return this.isDisposed; }

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

    private isDisposed: boolean = false;
    private pending: ISequencedDocumentMessage[] = [];
    private fetching = false;

    private inQuorum = false;

    private updateSequenceNumberTimer: NodeJS.Timeout | undefined;

    // The minimum sequence number and last sequence number received from the server
    private minSequenceNumber: number = 0;

    // There are three numbers we track
    // * lastQueuedSequenceNumber is the last queued sequence number
    private lastQueuedSequenceNumber: number = 0;
    private baseSequenceNumber: number = 0;
    private baseTerm: number = 0;

    // The sequence number we initially loaded from
    private initSequenceNumber: number = 0;

    private readonly _inbound: DeltaQueue<ISequencedDocumentMessage>;
    private readonly _inboundSignal: DeltaQueue<ISignalMessage>;
    private readonly _outbound: DeltaQueue<IDocumentMessage[]>;

    private connectionP: Promise<IConnectionDetails> | undefined;
    private connection: DeltaConnection | undefined;
    private clientSequenceNumber = 0;
    private clientSequenceNumberObserved = 0;
    private closed = false;

    // track clientId used last time when we sent any ops
    private lastSubmittedClientId: string | undefined;

    private handler: IDeltaHandlerStrategy | undefined;
    private deltaStorageP: Promise<IDocumentDeltaStorageService> | undefined;

    private readonly contentCache = new ContentCache(DefaultContentBufferSize);

    private messageBuffer: IDocumentMessage[] = [];

    private connectFirstConnection = true;

    private deltaStorageDelay: number = 0;
    private deltaStreamDelay: number = 0;

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

    public get referenceSequenceNumber(): number {
        return this.baseSequenceNumber;
    }

    public get referenceTerm(): number {
        return this.baseTerm;
    }

    public get minimumSequenceNumber(): number {
        return this.minSequenceNumber;
    }

    public get maxMessageSize(): number {
        return this.connection!.details.serviceConfiguration
            ? this.connection!.details.serviceConfiguration.maxMessageSize
            : this.connection!.details.maxMessageSize || DefaultChunkSize;
    }

    public get version(): string {
        return this.connection!.details.version;
    }

    public get serviceConfiguration(): IServiceConfiguration | undefined {
        return this.connection ? this.connection.details.serviceConfiguration : undefined;
    }

    public get scopes(): string[] | undefined {
        return this.connection ? this.connection.details.claims.scopes : undefined;
    }

    public get active(): boolean {
        const res = this.inQuorum && this.connectionMode === "write";
        // user can't have r/w connection when user has only read permissions.
        // That said, connection can be r/w when host called forceReadonly(), as
        // this is view-only change
        assert(!(this._readonlyPermissions && res));
        return res;
    }

    public get socketDocumentId(): string | undefined {
        if (this.connection) {
            return this.connection.details.claims.documentId;
        }
        return undefined;
    }

    /**
     * The current connection mode, initially write.
     */
    public get connectionMode(): ConnectionMode {
        if (this.connection === undefined) {
            return "read";
        }
        return this.connection.details.mode;
    }

    /**
     * Tells if container is in read-only mode.
     * Components should listen for "readonly" notifications and disallow user
     * making changes to components.
     * Readonly state can be because of no storage write permission,
     * or due to host forcing readonly mode for container.
     * It is undefined if we have not yet established websocket connection
     * and do not know if user has write access to a file.
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
     */
    public get readonlyPermissions() {
        return this._readonlyPermissions;
    }

    /**
     * Automatic reconnecting enabled or disabled.
     * If set to Never, then reconnecting will never be allowed.
     */
    public get reconnectMode(): ReconnectMode {
        return this._reconnectMode;
    }

    /**
     * Enables or disables automatic reconnecting.
     * Will throw an error if reconnectMode set to Never.
     */
    public setAutomaticReconnect(reconnect: boolean): void {
        assert(
            this._reconnectMode !== ReconnectMode.Never,
            "Cannot toggle automatic reconnect if reconnect is set to Never.");
        this._reconnectMode = reconnect ? ReconnectMode.Enabled : ReconnectMode.Disabled;
    }

    /**
     * Sends signal to runtime (and components) to be read-only.
     * Hosts may have read only views, indicating to components that no edits are allowed.
     * This is independent from this._readonlyPermissions (permissions) and this.connectionMode
     * (server can return "write" mode even when asked for "read")
     * Leveraging same "readonly" event as runtime & components should behave the same in such case
     * as in read-only permissions.
     * But this.active can be used by some DDSs to figure out if ops can be sent
     * (for example, read-only view still participates in code proposals / upgrades decisions)
     */
    public forceReadonly(readonly: boolean) {
        const oldValue = this.readonly;
        this._forceReadonly = readonly;
        if (oldValue !== this.readonly) {
            this.emit("readonly", this.readonly);
        }
    }

    private set_readonlyPermissions(readonly: boolean) {
        const oldValue = this.readonly;
        this._readonlyPermissions = readonly;
        if (oldValue !== this.readonly) {
            this.emit("readonly", this.readonly);
        }
    }

    constructor(
        private readonly serviceProvider: () => IDocumentService | undefined,
        private client: IClient,
        private readonly logger: ITelemetryLogger,
        reconnectAllowed: boolean,
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
            this.close(CreateContainerError(error));
        });

        // Outbound message queue. The outbound queue is represented as a queue of an array of ops. Ops contained
        // within an array *must* fit within the maxMessageSize and are guaranteed to be ordered sequentially.
        this._outbound = new DeltaQueue<IDocumentMessage[]>(
            (messages) => {
                this.connection!.submit(messages);
            });

        this._outbound.on("error", (error) => {
            this.close(CreateContainerError(error));
        });

        // Inbound signal queue
        this._inboundSignal = new DeltaQueue<ISignalMessage>((message) => {
            this.handler!.processSignal({
                clientId: message.clientId,
                content: JSON.parse(message.content as string),
            });
        });

        this._inboundSignal.on("error", (error) => {
            this.close(CreateContainerError(error));
        });

        // Require the user to start the processing
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        this._inbound.pause();
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        this._outbound.pause();
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        this._inboundSignal.pause();
    }

    public dispose() {
        assert.fail("Not implemented.");
        this.isDisposed = true;
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
        debug("Attached op handler", sequenceNumber);

        this.initSequenceNumber = sequenceNumber;
        this.baseSequenceNumber = sequenceNumber;
        this.baseTerm = term;
        this.minSequenceNumber = minSequenceNumber;
        this.lastQueuedSequenceNumber = sequenceNumber;

        // We will use same check in other places to make sure all the seq number above are set properly.
        assert(!this.handler);
        this.handler = handler;
        assert(this.handler);

        this._inbound.systemResume();
        this._inboundSignal.systemResume();

        // We could have connected to delta stream before getting here
        // If so, it's time to process any accumulated ops
        // Or request OPs from snapshot / or point zero (if we have no ops at all)
        if (this.pending.length > 0) {
            this.catchUp([], "DocumentOpen");
        } else if (this.connection !== undefined || this.connectionP !== undefined) {
            // eslint-disable-next-line @typescript-eslint/no-floating-promises
            this.fetchMissingDeltas("DocumentOpen", this.lastQueuedSequenceNumber);
        }
    }

    public updateQuorumJoin() {
        this.inQuorum = true;
    }

    public updateQuorumLeave() {
        this.inQuorum = false;
    }

    public async connect(args: IConnectionArgs = {}): Promise<IConnectionDetails> {
        if (this.connection) {
            return this.connection.details;
        }

        if (this.connectionP) {
            return this.connectionP;
        }

        const fetchOpsFromStorage = args.fetchOpsFromStorage ?? true;
        let requestedMode = args.mode ?? this.defaultReconnectionMode;

        // if we have any non-acked ops from last connection, reconnect as "write".
        // without that we would connect in view-only mode, which will result in immediate
        // firing of "connected" event from Container and switch of current clientId (as tracked
        // by all DDSs). This will make it impossible to figure out if ops actually made it through,
        // so DDSs will immediately resubmit all pending ops, and some of them will be duplicates, corrupting document
        if (this.clientSequenceNumberObserved !== this.clientSequenceNumber) {
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
        this.logger.debugAssert(this.handler !== undefined || fetchOpsFromStorage); // on boot, always fetch ops!
        if (fetchOpsFromStorage && this.handler) {
            // eslint-disable-next-line @typescript-eslint/no-floating-promises
            this.fetchMissingDeltas(args.reason ?? "DocumentOpen", this.lastQueuedSequenceNumber);
        }

        const docService = this.serviceProvider();
        if (!docService) {
            throw new Error("Container is not attached");
        }

        // The promise returned from connectCore will settle with a resolved DeltaConnection or reject with error
        const connectCore = async () => {
            let connection: DeltaConnection | undefined;
            let delay = InitialReconnectDelaySeconds;
            let connectRepeatCount = 0;
            const connectStartTime = performanceNow();

            // This loop will keep trying to connect until successful, with a delay between each iteration.
            while (connection === undefined) {
                if (this.closed) {
                    throw new Error("Attempting to connect a closed DeltaManager");
                }
                connectRepeatCount++;

                try {
                    this.client.mode = requestedMode;
                    connection = await DeltaConnection.connect(docService, this.client);
                } catch (origError) {
                    const error = CreateContainerError(origError);

                    // Socket.io error when we connect to wrong socket, or hit some multiplexing bug
                    if (!canRetryOnError(origError)) {
                        this.close(error);
                        throw error;
                    }

                    // Log error once - we get too many errors in logs when we are offline,
                    // and unfortunately there is no reliable way to detect that.
                    if (connectRepeatCount === 1) {
                        logNetworkFailure(
                            this.logger,
                            {
                                delay, // seconds
                                eventName: "DeltaConnectionFailureToConnect",
                            },
                            origError);
                    }

                    const retryDelayFromError = getRetryDelayFromError(origError);
                    delay = retryDelayFromError ?? Math.min(delay * 2, MaxReconnectDelaySeconds);

                    if (retryDelayFromError) {
                        this.emitDelayInfo(RetryFor.DeltaStream, retryDelayFromError, error);
                    }
                    await waitForConnectedState(delay * 1000);
                }
            }

            // If we retried more than once, log an event about how long it took
            if (connectRepeatCount > 1) {
                this.logger.sendTelemetryEvent({
                    attempts: connectRepeatCount,
                    duration: TelemetryLogger.formatTick(performanceNow() - connectStartTime),
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
                resolve(connection.details);
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

    public submit(type: MessageType, contents: any, batch = false, metadata?: any): number {
        // TODO need to fail if gets too large
        // const serializedContent = JSON.stringify(this.messageBuffer);
        // const maxOpSize = this.context.deltaManager.maxMessageSize;

        if (this.readonly) {
            this.logger.sendErrorEvent({ eventName: "SubmitOpReadOnly", type });
            return -1;
        }

        // reset clientSequenceNumber if we are using new clientId.
        // we keep info about old connection as long as possible to be able to account for all non-acked ops
        // that we pick up on next connection.
        assert(this.connection);
        if (this.lastSubmittedClientId !== this.connection?.details.clientId) {
            this.lastSubmittedClientId = this.connection?.details.clientId;
            this.clientSequenceNumber = 0;
            this.clientSequenceNumberObserved = 0;
        }

        // Start adding trace for the op.
        const traces: ITrace[] = [
            {
                action: "start",
                service: this.clientDetails.type || "unknown",
                timestamp: Date.now(),
            }];

        const message: IDocumentMessage = {
            clientSequenceNumber: ++this.clientSequenceNumber,
            contents: JSON.stringify(contents),
            metadata,
            referenceSequenceNumber: this.baseSequenceNumber,
            traces,
            type,
        };

        const outbound = this.createOutboundMessage(type, message);
        this.stopSequenceNumberUpdate();
        this.emit("submitOp", message);

        if (!batch) {
            this.flush();
            this.messageBuffer.push(outbound);
            this.flush();
        } else {
            this.messageBuffer.push(outbound);
        }

        return outbound.clientSequenceNumber;
    }

    public submitSignal(content: any) {
        if (this.connection) {
            this.connection.submitSignal(content);
        } else {
            this.logger.sendErrorEvent({ eventName: "submitSignalDisconnected" });
        }
    }

    private async getDeltas(
        telemetryEventSuffix: string,
        fromInitial: number,
        to: number | undefined,
        callback: (messages: ISequencedDocumentMessage[]) => void) {
        let retry: number = 0;
        let from: number = fromInitial;
        let deltas: ISequencedDocumentMessage[] = [];
        let deltasRetrievedTotal = 0;

        const docService = this.serviceProvider();
        if (!docService) {
            throw new Error("Delta manager is not attached");
        }

        const telemetryEvent = PerformanceEvent.start(this.logger, {
            eventName: `GetDeltas_${telemetryEventSuffix}`,
            from,
            to,
        });

        let requests = 0;
        let deltaStorage: IDocumentDeltaStorageService | undefined;

        while (!this.closed) {
            const maxFetchTo = from + MaxBatchDeltas;
            const fetchTo = to === undefined ? maxFetchTo : Math.min(maxFetchTo, to);

            let deltasRetrievedLast = 0;
            let success = true;
            let canRetry = false;
            let retryAfter: number | undefined;

            try {
                // Connect to the delta storage endpoint
                if (!deltaStorage) {
                    if (!this.deltaStorageP) {
                        this.deltaStorageP = docService.connectToDeltaStorage();
                    }
                    deltaStorage = await this.deltaStorageP;
                }

                requests++;

                // Issue async request for deltas - limit the number fetched to MaxBatchDeltas
                canRetry = true;
                const deltasP = deltaStorage.get(from, fetchTo);

                // Return previously fetched deltas, for processing while we are waiting for new request.
                if (deltas.length > 0) {
                    callback(deltas);
                }

                // Now wait for request to come back
                deltas = await deltasP;

                // Note that server (or driver code) can push here something unexpected, like undefined
                // Exception thrown as result of it will result in us retrying
                deltasRetrievedLast = deltas.length;
                deltasRetrievedTotal += deltasRetrievedLast;
                const lastFetch = deltasRetrievedLast > 0 ? deltas[deltasRetrievedLast - 1].sequenceNumber : from;

                // If we have no upper bound and fetched less than the max deltas - meaning we got as many as exit -
                // then we can resolve the promise. We also resolve if we fetched up to the expected to. Otherwise
                // we will look to try again
                // Note #1: we can get more ops than what we asked for - need to account for that!
                // Note #2: from & to are exclusive! I.e. we actually expect [from + 1, to - 1] range of ops back!
                // 1) to === undefined case: if last op  is below what we expect, then storage does not have
                //    any more, thus it's time to leave
                // 2) else case: if we got what we asked (to - 1) or more, then time to leave.
                if (to === undefined ? lastFetch < maxFetchTo - 1 : to - 1 <= lastFetch) {
                    callback(deltas);
                    telemetryEvent.end({ lastFetch, deltasRetrievedTotal, requests });
                    return;
                }

                // Attempt to fetch more deltas. If we didn't receive any in the previous call we up our retry
                // count since something prevented us from seeing those deltas
                from = lastFetch;
            } catch (origError) {
                canRetry = canRetry && canRetryOnError(origError);
                const error = CreateContainerError(origError, canRetry);

                logNetworkFailure(
                    this.logger,
                    {
                        eventName: "GetDeltas_Error",
                        fetchTo,
                        from,
                        requests,
                        retry: retry + 1,
                    },
                    origError);

                if (!canRetry) {
                    // It's game over scenario.
                    telemetryEvent.cancel({ category: "error" }, origError);
                    this.close(error);
                    return;
                }
                success = false;
                retryAfter = getRetryDelayFromError(origError);

                if (retryAfter !== undefined && retryAfter >= 0) {
                    this.emitDelayInfo(RetryFor.DeltaStorage, retryAfter, error);
                }
            }

            let delay: number;
            if (deltasRetrievedLast !== 0) {
                delay = 0;
                retry = 0; // start calculating timeout over if we got some ops
            } else {
                retry++;
                delay = retryAfter ?? Math.min(MaxFetchDelaySeconds, MissingFetchDelaySeconds * Math.pow(2, retry));

                // Chances that we will get something from storage after that many retries is zero.
                // We wait 10 seconds between most of retries, so that's 16 minutes of waiting!
                // Note - it's very important that we differentiate connected state from possibly disconnected state!
                // Only bail out if we successfully connected to storage, but there were no ops
                // One (last) successful connection is sufficient, even if user was disconnected all prior attempts
                if (success && retry >= 100) {
                    telemetryEvent.cancel({
                        category: "error",
                        error: "too many retries",
                        retry,
                        requests,
                        deltasRetrievedTotal,
                        replayFrom: from,
                        to,
                    });
                    const closeError = createGenericNetworkError(
                        "Failed to retrieve ops from storage: giving up after too many retries",
                        false /* canRetry */,
                    );
                    this.close(closeError);
                    return;
                }
            }

            telemetryEvent.reportProgress({
                delay, // seconds
                deltasRetrievedLast,
                deltasRetrievedTotal,
                replayFrom: from,
                requests,
                retry,
                success,
            });

            await waitForConnectedState(delay * 1000);
        }

        // Might need to change to non-error event
        this.logger.sendErrorEvent({ eventName: "GetDeltasClosedConnection" });
        telemetryEvent.cancel({ error: "container closed" });
    }

    /**
     * Closes the connection and clears inbound & outbound queues.
     */
    public close(error?: CriticalContainerError): void {
        if (this.closed) {
            return;
        }
        this.closed = true;

        this.stopSequenceNumberUpdate();

        // This raises "disconnect" event
        this.disconnectFromDeltaStream(error !== undefined ? `${error.message}` : "Container closed");

        this._inbound.clear();
        this._outbound.clear();
        this._inboundSignal.clear();

        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        this._inbound.systemPause();
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        this._inboundSignal.systemPause();

        // Drop pending messages - this will ensure catchUp() does not go into infinite loop
        this.pending = [];

        // Notify everyone we are in read-only state.
        // Useful for components in case we hit some critical error,
        // to switch to a mode where user edits are not accepted
        this.set_readonlyPermissions(true);

        // This needs to be the last thing we do (before removing listeners), as it causes
        // Container to dispose context and break ability of components / runtime to "hear"
        // from delta manager, including notification (above) about readonly state.
        this.emit("closed", error);

        this.removeAllListeners();
    }

    // Specific system level message attributes are need to be looked at by the server.
    // Hence they are separated and promoted as top level attributes.
    private createOutboundMessage(
        type: MessageType,
        coreMessage: IDocumentMessage): IDocumentMessage {
        if (isSystemType(type)) {
            const data = coreMessage.contents as string;
            coreMessage.contents = null;
            const outboundMessage: IDocumentSystemMessage = {
                ...coreMessage,
                data,
            };
            return outboundMessage;
        } else {
            return coreMessage;
        }
    }

    private cancelDelayInfo(retryEndpoint: number) {
        if (retryEndpoint === RetryFor.DeltaStorage) {
            this.deltaStorageDelay = 0;
        } else if (retryEndpoint === RetryFor.DeltaStream) {
            this.deltaStreamDelay = 0;
        }
    }

    private emitDelayInfo(retryEndpoint: number, delay: number, error: CriticalContainerError) {
        if (retryEndpoint === RetryFor.DeltaStorage) {
            this.deltaStorageDelay = delay;
        } else if (retryEndpoint === RetryFor.DeltaStream) {
            this.deltaStreamDelay = delay;
        }

        const delayTime = Math.max(this.deltaStorageDelay, this.deltaStreamDelay);
        if (delayTime > 0) {
            const throttlingError: IThrottlingWarning = {
                errorType: ErrorType.throttlingError,
                canRetry: true,
                message: `Service busy/throttled: ${error.message}`,
                retryAfterSeconds: delayTime / 1000,
            };
            this.emit("throttled", throttlingError);
        }
    }

    /**
     * Once we've successfully gotten a DeltaConnection, we need to set up state, attach event listeners, and process
     * initial messages.
     * @param connection - The newly established connection
     */
    private setupNewSuccessfulConnection(connection: DeltaConnection, requestedMode: ConnectionMode) {
        this.connection = connection;

        // Does information in scopes & mode matches?
        // If we asked for "write" and got "read", then file is read-only
        // But if we ask read, server can still give us write.
        const readonly = !connection.details.claims.scopes.includes(ScopeType.DocWrite);
        assert(requestedMode === "read" || readonly === (this.connectionMode === "read"),
            "claims/connectionMode mismatch");
        assert(!readonly || this.connectionMode === "read", "readonly perf with write connection");
        this.set_readonlyPermissions(readonly);

        this.cancelDelayInfo(RetryFor.DeltaStream);

        if (this.closed) {
            // Raise proper events, Log telemetry event and close connection.
            this.disconnectFromDeltaStream(`Disconnect on close`);
            assert(!connection.connected); // Check we indeed closed it!
            return;
        }

        // We cancel all ops on lost of connectivity, and rely on DDSs to resubmit them.
        // Semantics are not well defined for batches (and they are broken right now on disconnects anyway),
        // but it's safe to assume (until better design is put into place) that batches should not exist
        // across multiple connections. Right now we assume runtime will not submit any ops in disconnected
        // state. As requirements change, so should these checks.
        assert(this.messageBuffer.length === 0, "messageBuffer is not empty on new connection");

        this._outbound.systemResume();

        connection.on("op", (documentId: string, messages: ISequencedDocumentMessage[]) => {
            if (messages instanceof Array) {
                this.enqueueMessages(messages);
            } else {
                this.enqueueMessages([messages]);
            }
        });

        connection.on("op-content", (message: IContentMessage) => {
            this.contentCache.set(message);
        });

        connection.on("signal", (message: ISignalMessage) => {
            this._inboundSignal.push(message);
        });

        // Always connect in write mode after getting nacked.
        connection.on("nack", (documentId: string, messages: INack[]) => {
            const message = messages[0];
            // TODO: we should remove this check when service updates?
            if (this._readonlyPermissions) {
                this.close(createWriteError("WriteOnReadOnlyDocument"));
            }

            // check message.content for back-compat with old service.
            const reconnectInfo = message.content
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
                connection,
                "write",
                reconnectInfo,
            );
        });

        // Connection mode is always read on disconnect/error unless the system mode was write.
        connection.on("disconnect", (disconnectReason) => {
            // Note: we might get multiple disconnect calls on same socket, as early disconnect notification
            // ("server_disconnect", ODSP-specific) is mapped to "disconnect"
            // eslint-disable-next-line @typescript-eslint/no-floating-promises
            this.reconnectOnError(
                connection,
                this.defaultReconnectionMode,
                createReconnectError("Disconnect", disconnectReason),
            );
        });

        connection.on("error", (error) => {
            // Observation based on early pre-production telemetry:
            // We are getting transport errors from WebSocket here, right before or after "disconnect".
            // This happens only in Firefox.
            logNetworkFailure(this.logger, { eventName: "DeltaConnectionError" }, error);
            // eslint-disable-next-line @typescript-eslint/no-floating-promises
            this.reconnectOnError(
                connection,
                this.defaultReconnectionMode,
                createReconnectError("error", error),
            );
        });

        connection.on("pong", (latency: number) => {
            this.emit("pong", latency);
        });

        // Notify of the connection
        // WARNING: This has to happen before processInitialMessages() call below.
        // If not, we may not update Container.pendingClientId in time before seeing our own join session op.
        this.emit("connect", connection.details);

        /* Issue #1566: Backward compat */
        this.processInitialMessages(
            connection.details.initialMessages ?? [],
            connection.details.initialContents ?? [],
            connection.details.initialSignals ?? [],
            this.connectFirstConnection);

        // if we have some op on the wire (or will have a "join" op for ourselves for r/w connection), then client
        // can detect it has a gap and fetch missing ops. However if we are connecting as view-only, then there
        // is no good signal to realize if client is behind. Thus we have to hit storage to see if any ops are there.
        if (this.handler && connection.details.mode !== "write" &&
            (connection.details.initialMessages === undefined || connection.details.initialMessages.length === 0)) {
            // eslint-disable-next-line @typescript-eslint/no-floating-promises
            this.fetchMissingDeltas("Reconnect", this.lastQueuedSequenceNumber);
        }

        this.connectFirstConnection = false;
    }

    /**
     * Disconnect the current connection.
     * @param reason - Text description of disconnect reason to emit with disconnect event
     */
    private disconnectFromDeltaStream(reason: string) {
        const connection = this.connection;
        if (!connection) {
            return;
        }

        // We cancel all ops on lost of connectivity, and rely on DDSs to resubmit them.
        // Semantics are not well defined for batches (and they are broken right now on disconnects anyway),
        // but it's safe to assume (until better design is put into place) that batches should not exist
        // across multiple connections. Right now we assume runtime will not submit any ops in disconnected
        // state. As requirements change, so should these checks.
        assert(this.messageBuffer.length === 0, "messageBuffer is not empty on disconnect");

        // Avoid any re-entrancy - clear object reference
        this.connection = undefined;

        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        this._outbound.systemPause();
        this._outbound.clear();
        this.emit("disconnect", reason);

        connection.close();
    }

    /**
     * Disconnect the current connection and reconnect.
     * @param connection - The connection that wants to reconnect - no-op if it's different from this.connection
     * @param requestedMode - Read or write
     * @param reconnectInfo - Error reconnect information including whether or not to reconnect
     * @returns A promise that resolves when the connection is reestablished or we stop trying
     */
    private async reconnectOnError(
        connection: DeltaConnection,
        requestedMode: ConnectionMode,
        error: CriticalContainerError,
    ) {
        // We quite often get protocol errors before / after observing nack/disconnect
        // we do not want to run through same sequence twice.
        if (connection !== this.connection) {
            return;
        }

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
            const delay = getRetryDelayFromError(error);
            if (delay !== undefined) {
                this.emitDelayInfo(RetryFor.DeltaStream, delay, error);
                await waitForConnectedState(delay * 1000);
            }

            this.connect({ mode: requestedMode, fetchOpsFromStorage: false }).catch((err) => {
                // Errors are raised as "error" event and close container.
                // Have a catch-all case in case we missed something
                if (!this.closed) {
                    this.logger.sendErrorEvent({ eventName: "ConnectException" }, err);
                }
            });
        }
    }

    private processInitialMessages(
        messages: ISequencedDocumentMessage[],
        contents: IContentMessage[],
        signals: ISignalMessage[],
        firstConnection: boolean,
    ): void {
        for (const content of contents) {
            this.contentCache.set(content);
        }
        if (messages.length > 0) {
            this.catchUp(messages, firstConnection ? "InitialOps" : "ReconnectOps");
        }
        for (const signal of signals) {
            this._inboundSignal.push(signal);
        }
    }

    private enqueueMessages(
        messages: ISequencedDocumentMessage[],
        telemetryEventSuffix: string = "OutOfOrderMessage",
    ): void {
        if (!this.handler) {
            // We did not setup handler yet.
            // This happens when we connect to web socket faster than we get attributes for container
            // and thus faster than attachOpHandler() is called
            // this.baseSequenceNumber is still zero, so we can't rely on this.fetchMissingDeltas()
            // to do the right thing.
            this.pending = this.pending.concat(messages);
            return;
        }

        let duplicateStart: number | undefined;
        let duplicateEnd: number | undefined;
        let duplicateCount = 0;

        for (const message of messages) {
            // Check that the messages are arriving in the expected order
            if (message.sequenceNumber <= this.lastQueuedSequenceNumber) {
                duplicateCount++;
                if (duplicateStart === undefined || duplicateStart > message.sequenceNumber) {
                    duplicateStart = message.sequenceNumber;
                }
                if (duplicateEnd === undefined || duplicateEnd < message.sequenceNumber) {
                    duplicateEnd = message.sequenceNumber;
                }
            } else if (message.sequenceNumber !== this.lastQueuedSequenceNumber + 1) {
                this.pending.push(message);
                // eslint-disable-next-line @typescript-eslint/no-floating-promises
                this.fetchMissingDeltas(telemetryEventSuffix, this.lastQueuedSequenceNumber, message.sequenceNumber);
            } else {
                this.lastQueuedSequenceNumber = message.sequenceNumber;
                this._inbound.push(message);
            }
        }

        if (duplicateCount !== 0) {
            this.logger.sendTelemetryEvent({
                eventName: `DuplicateMessages_${telemetryEventSuffix}`,
                start: duplicateStart,
                end: duplicateEnd,
                count: duplicateCount,
            });
        }
    }

    private processInboundMessage(message: ISequencedDocumentMessage): void {
        const startTime = Date.now();

        // All non-system messages are coming from some client, and should have clientId
        // System messages may have no clientId (but some do, like propose, noop, summarize)
        // Note: NoClient has not been added yet to isSystemMessage (in 0.16.x branch)
        assert(message.clientId || isSystemMessage(message) || message.type === MessageType.NoClient,
            "non-system message have to have clientId");

        // if we have connection, and message is local, then we better treat is as local!
        assert(!this.connection || this.connection.details.clientId !== message.clientId ||
            this.lastSubmittedClientId === message.clientId, "Not accounting local messages correctly");

        if (this.lastSubmittedClientId !== undefined && this.lastSubmittedClientId === message.clientId) {
            const clientSequenceNumber = message.clientSequenceNumber;

            assert(this.clientSequenceNumberObserved < clientSequenceNumber, "client seq# not growing");
            assert(clientSequenceNumber <= this.clientSequenceNumber,
                "Incoming local client seq# > generated by this client");

            this.clientSequenceNumberObserved = clientSequenceNumber;
            if (clientSequenceNumber === this.clientSequenceNumber) {
                this.emit("allSentOpsAckd");
            }
        }

        // TODO Remove after SPO picks up the latest build.
        if (message.contents && typeof message.contents === "string" && message.type !== MessageType.ClientLeave) {
            message.contents = JSON.parse(message.contents);
        }

        // Add final ack trace.
        if (message.traces && message.traces.length > 0) {
            message.traces.push({
                action: "end",
                service: this.clientDetails.type || "unknown",
                timestamp: Date.now(),
            });
        }

        // Watch the minimum sequence number and be ready to update as needed
        assert(this.minSequenceNumber <= message.minimumSequenceNumber, "msn moves backwards");
        this.minSequenceNumber = message.minimumSequenceNumber;

        assert.equal(message.sequenceNumber, this.baseSequenceNumber + 1, "non-seq seq#");
        this.baseSequenceNumber = message.sequenceNumber;

        // Back-compat for older server with no term
        this.baseTerm = message.term === undefined ? 1 : message.term;

        this.emit("beforeOpProcessing", message);

        const result = this.handler!.process(message);
        this.scheduleSequenceNumberUpdate(message, result.immediateNoOp === true);

        const endTime = Date.now();
        this.emit("processTime", endTime - startTime);
    }

    /**
     * Retrieves the missing deltas between the given sequence numbers
     */
    private async fetchMissingDeltas(telemetryEventSuffix: string, from: number, to?: number): Promise<void> {
        // Exit out early if we're already fetching deltas
        if (this.fetching) {
            return;
        }

        if (this.closed) {
            this.logger.sendTelemetryEvent({ eventName: "fetchMissingDeltasClosedConnection" });
            return;
        }

        this.fetching = true;

        await this.getDeltas(telemetryEventSuffix, from, to, (messages) => {
            this.cancelDelayInfo(RetryFor.DeltaStorage);
            this.catchUpCore(messages, telemetryEventSuffix);
        });

        this.fetching = false;
    }

    private catchUp(messages: ISequencedDocumentMessage[], telemetryEventSuffix: string): void {
        const props: {
            eventName: string;
            messageCount: number;
            pendingCount: number;
            from?: number;
            to?: number;
            messageGap?: number;
        } = {
            eventName: `CatchUp_${telemetryEventSuffix}`,
            messageCount: messages.length,
            pendingCount: this.pending.length,
        };
        if (messages.length !== 0) {
            props.from = messages[0].sequenceNumber;
            props.to = messages[messages.length - 1].sequenceNumber;
            props.messageGap = this.handler ? props.from - this.lastQueuedSequenceNumber - 1 : undefined;
        }
        this.logger.sendPerformanceEvent(props);

        this.catchUpCore(messages, telemetryEventSuffix);
    }

    private catchUpCore(messages: ISequencedDocumentMessage[], telemetryEventSuffix?: string): void {
        // Apply current operations
        this.enqueueMessages(messages, telemetryEventSuffix);

        // Then sort pending operations and attempt to apply them again.
        // This could be optimized to stop handling messages once we realize we need to fetch missing values.
        // But for simplicity, and because catching up should be rare, we just process all of them.
        // Optimize for case of no handler - we put ops back into this.pending in such case
        if (this.handler) {
            const pendingSorted = this.pending.sort((a, b) => a.sequenceNumber - b.sequenceNumber);
            this.pending = [];
            this.enqueueMessages(pendingSorted, telemetryEventSuffix);
        }
    }

    /**
     * Schedules as ack to the server to update the reference sequence number
     */
    private scheduleSequenceNumberUpdate(message: ISequencedDocumentMessage, immediateNoOp: boolean): void {
        // Exit early for inactive (not in quorum or not writers) clients.
        // They don't take part in the minimum sequence number calculation.
        if (!this.active) {
            this.stopSequenceNumberUpdate();
            return;
        }

        // While processing a message, an immediate no-op can be requested.
        // i.e. to expedite approve or commit phase of quorum.
        if (immediateNoOp) {
            this.stopSequenceNumberUpdate();
            this.submit(MessageType.NoOp, ImmediateNoOpResponse);
            return;
        }

        // We don't acknowledge no-ops to avoid acknowledgement cycles (i.e. ack the MSN
        // update, which updates the MSN, then ack the update, etc...).
        if (message.type === MessageType.NoOp) {
            return;
        }

        // We will queue a message to update our reference sequence number upon receiving a server
        // operation. This allows the server to know our true reference sequence number and be able to
        // correctly update the minimum sequence number (MSN).
        if (this.updateSequenceNumberTimer === undefined) {
            // Clear an update in 2 s
            this.updateSequenceNumberTimer = setTimeout(() => {
                this.updateSequenceNumberTimer = undefined;
                if (this.active) {
                    this.submit(MessageType.NoOp, null);
                }
            }, 2000);
        }
    }

    private stopSequenceNumberUpdate(): void {
        if (this.updateSequenceNumberTimer) {
            clearTimeout(this.updateSequenceNumberTimer);
        }
        this.updateSequenceNumberTimer = undefined;
    }
}
