/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IDisposable,
    ITelemetryLogger,
    ITelemetryProperties,
} from "@fluidframework/common-definitions";
import { assert, performance, TypedEventEmitter } from "@fluidframework/common-utils";
import {
    IDeltaQueue,
    ReadOnlyInfo,
    IConnectionDetails,
    ICriticalContainerError,
} from "@fluidframework/container-definitions";
import {
    GenericError,
} from "@fluidframework/container-utils";
import {
    IDocumentService,
    IDocumentDeltaConnection,
    IDocumentDeltaConnectionEvents,
} from "@fluidframework/driver-definitions";
import {
    canRetryOnError,
    createWriteError,
    createGenericNetworkError,
    getRetryDelayFromError,
    IAnyDriverError,
    logNetworkFailure,
    waitForConnectedState,
    DeltaStreamConnectionForbiddenError,
} from "@fluidframework/driver-utils";
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
    MessageType,
    ScopeType,
    ISequencedDocumentSystemMessage,
} from "@fluidframework/protocol-definitions";
import {
    TelemetryLogger,
    normalizeError,
} from "@fluidframework/telemetry-utils";
import {
    ReconnectMode,
    IConnectionManager,
    IConnectionManagerFactoryArgs,
} from "./contracts";
import { DeltaQueue } from "./deltaQueue";

const MaxReconnectDelayInMs = 8000;
const InitialReconnectDelayInMs = 1000;
const DefaultChunkSize = 16 * 1024;

const fatalConnectErrorProp = { fatalConnectError: true };

function getNackReconnectInfo(nackContent: INackContent) {
    const message = `Nack (${nackContent.type}): ${nackContent.message}`;
    const canRetry = nackContent.code !== 403;
    const retryAfterMs = nackContent.retryAfter !== undefined ? nackContent.retryAfter * 1000 : undefined;
    return createGenericNetworkError(
        message,
        { canRetry, retryAfterMs },
        { statusCode: nackContent.code, driverVersion: undefined });
}

/**
 * Implementation of IDocumentDeltaConnection that does not support submitting
 * or receiving ops. Used in storage-only mode.
 */
class NoDeltaStream
    extends TypedEventEmitter<IDocumentDeltaConnectionEvents>
    implements IDocumentDeltaConnection, IDisposable
{
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
    serviceConfiguration: IClientConfiguration = {
        maxMessageSize: 0,
        blockSize: 0,
        summary: undefined as any,
    };
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

    private _disposed = false;
    public get disposed() { return this._disposed; }
    public dispose() { this._disposed = true; }
}

/**
 * Implementation of IConnectionManager, used by Container class
 * Implements constant connectivity to relay service, by reconnecting in case of loast connection or error.
 * Exposes various controls to influecen this process, including manual reconnects, forced read-only mode, etc.
 */
export class ConnectionManager implements IConnectionManager {
    /** Connection mode used when reconnecting on error or disconnect. */
    private readonly defaultReconnectionMode: ConnectionMode;

    private pendingConnection = false;
    private connection: IDocumentDeltaConnection | undefined;

    /** file ACL - whether user has only read-only access to a file */
    private _readonlyPermissions: boolean | undefined;

    /** tracks host requiring read-only mode. */
    private _forceReadonly = false;

    /**
     * Controls whether the DeltaManager will automatically reconnect to the delta stream after receiving a disconnect.
     */
    private _reconnectMode: ReconnectMode;

    /** True if there is pending (async) reconnection from "read" to "write" */
    private pendingReconnect = false;

    /** downgrade "write" connection to "read" */
    private downgradedConnection = false;

    private clientSequenceNumber = 0;
    private clientSequenceNumberObserved = 0;
    /** Counts the number of noops sent by the client which may not be acked. */
    private trailingNoopCount = 0;

    /** track clientId used last time when we sent any ops */
    private lastSubmittedClientId: string | undefined;

    private connectFirstConnection = true;

    private _connectionVerboseProps: Record<string, string | number> = {};

    private _connectionProps: ITelemetryProperties = {};

    private closed = false;

    private readonly _outbound: DeltaQueue<IDocumentMessage[]>;

    public get connectionVerboseProps() { return this._connectionVerboseProps; }

    public readonly clientDetails: IClientDetails;

    /**
     * The current connection mode, initially read.
     */
     public get connectionMode(): ConnectionMode {
        assert(!this.downgradedConnection || this.connection?.mode === "write",
            0x277 /* "Did we forget to reset downgradedConnection on new connection?" */);
        if (this.connection === undefined) {
            return "read";
        }
        return this.connection.mode;
    }

    public get connected() { return this.connection !== undefined; }

    public get clientId() { return this.connection?.clientId; }
    /**
     * Automatic reconnecting enabled or disabled.
     * If set to Never, then reconnecting will never be allowed.
     */
     public get reconnectMode(): ReconnectMode {
        return this._reconnectMode;
    }

    public get maxMessageSize(): number {
        return this.connection?.serviceConfiguration?.maxMessageSize
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

    public get outbound(): IDeltaQueue<IDocumentMessage[]> {
        return this._outbound;
    }

    /**
     * Returns set of props that can be logged in telemetry that provide some insights / statistics
     * about current or last connection (if there is no connection at the moment)
    */
     public get connectionProps(): ITelemetryProperties {
        if (this.connection !== undefined) {
            return this._connectionProps;
        } else {
            return {
                ...this._connectionProps,
                // Report how many ops this client sent in last disconnected session
                sentOps: this.clientSequenceNumber,
            };
        }
    }

    public shouldJoinWrite(): boolean {
        // We don't have to wait for ack for topmost NoOps. So subtract those.
        return this.clientSequenceNumberObserved < (this.clientSequenceNumber - this.trailingNoopCount);
    }

    /**
     * Tells if container is in read-only mode.
     * Data stores should listen for "readonly" notifications and disallow user
     * making changes to data stores.
     * Readonly state can be because of no storage write permission,
     * or due to host forcing readonly mode for container.
     * It is undefined if we have not yet established websocket connection
     * and do not know if user has write access to a file.
     */
    private get readonly() {
        if (this._forceReadonly) {
            return true;
        }
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

    private static detailsFromConnection(connection: IDocumentDeltaConnection): IConnectionDetails {
        return {
            claims: connection.claims,
            clientId: connection.clientId,
            existing: connection.existing,
            checkpointSequenceNumber: connection.checkpointSequenceNumber,
            get initialClients() { return connection.initialClients; },
            mode: connection.mode,
            serviceConfiguration: connection.serviceConfiguration,
            version: connection.version,
        };
    }

    constructor(
        private readonly serviceProvider: () => IDocumentService | undefined,
        private client: IClient,
        reconnectAllowed: boolean,
        private readonly logger: ITelemetryLogger,
        private readonly props: IConnectionManagerFactoryArgs,
    ) {
        this.clientDetails = this.client.details;
        this.defaultReconnectionMode = this.client.mode;
        this._reconnectMode = reconnectAllowed ? ReconnectMode.Enabled : ReconnectMode.Never;

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
            this.props.closeHandler(normalizeError(error));
        });
    }

    public dispose(error?: ICriticalContainerError) {
        if (this.closed) {
            return;
        }
        this.closed = true;

        this.pendingConnection = false;

        // Ensure that things like triggerConnect() will short circuit
        this._reconnectMode = ReconnectMode.Never;

        this._outbound.clear();

        const disconnectReason = error !== undefined
            ? `Closing DeltaManager (${error.message})`
            : "Closing DeltaManager";

        // This raises "disconnect" event if we have active connection.
        this.disconnectFromDeltaStream(disconnectReason);

        // Notify everyone we are in read-only state.
        // Useful for data stores in case we hit some critical error,
        // to switch to a mode where user edits are not accepted
        this.set_readonlyPermissions(true);
    }

    /**
     * Enables or disables automatic reconnecting.
     * Will throw an error if reconnectMode set to Never.
    */
    public setAutoReconnect(mode: ReconnectMode): void {
        assert(mode !== ReconnectMode.Never && this._reconnectMode !== ReconnectMode.Never,
            0x278 /* "API is not supported for non-connecting or closed container" */);

        this._reconnectMode = mode;

        if (mode !== ReconnectMode.Enabled) {
            // immediately disconnect - do not rely on service eventually dropping connection.
            this.disconnectFromDeltaStream("setAutoReconnect");
        }
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
            assert(this._reconnectMode !== ReconnectMode.Never,
                0x279 /* "API is not supported for non-connecting or closed container" */);

            let reconnect = false;
            if (this.readonly === true) {
                // If we switch to readonly while connected, we should disconnect first
                // See comment in the "readonly" event handler to deltaManager set up by
                // the ContainerRuntime constructor

                if (this.shouldJoinWrite()) {
                    // If we have pending changes, then we will never send them - it smells like
                    // host logic error.
                    this.logger.sendErrorEvent({ eventName: "ForceReadonlyPendingChanged" });
                }

                reconnect = this.disconnectFromDeltaStream("Force readonly");
            }
            this.props.readonlyChangeHandler(this.readonly);
            if (reconnect) {
                // reconnect if we disconnected from before.
                this.triggerConnect("read");
            }
        }
    }

    private set_readonlyPermissions(readonly: boolean) {
        const oldValue = this.readonly;
        this._readonlyPermissions = readonly;
        if (oldValue !== this.readonly) {
            this.props.readonlyChangeHandler(this.readonly);
        }
    }

    public connect(connectionMode?: ConnectionMode) {
        this.connectCore(connectionMode).catch((error) => {
            const normalizedError = normalizeError(error, { props: fatalConnectErrorProp });
            this.props.closeHandler(normalizedError);
        });
    }

    private async connectCore(connectionMode?: ConnectionMode): Promise<void> {
        assert(!this.closed, 0x26a /* "not closed" */);

        if (this.connection !== undefined || this.pendingConnection) {
            return;
        }

        let requestedMode = connectionMode ?? this.defaultReconnectionMode;

        // if we have any non-acked ops from last connection, reconnect as "write".
        // without that we would connect in view-only mode, which will result in immediate
        // firing of "connected" event from Container and switch of current clientId (as tracked
        // by all DDSes). This will make it impossible to figure out if ops actually made it through,
        // so DDSes will immediately resubmit all pending ops, and some of them will be duplicates, corrupting document
        if (this.shouldJoinWrite()) {
            requestedMode = "write";
        }

        const docService = this.serviceProvider();
        assert(docService !== undefined, 0x2a7 /* "Container is not attached" */);

        let connection: IDocumentDeltaConnection | undefined;

        if (docService.policies?.storageOnly === true) {
            connection = new NoDeltaStream();
            // to keep setupNewSuccessfulConnection happy
            this.pendingConnection = true;
            this.setupNewSuccessfulConnection(connection, "read");
            assert(!this.pendingConnection, 0x2b3 /* "logic error" */);
            return;
        }

        // this.pendingConnection resets to false as soon as we know the outcome of the connection attempt
        this.pendingConnection = true;

        let delayMs = InitialReconnectDelayInMs;
        let connectRepeatCount = 0;
        const connectStartTime = performance.now();
        let lastError: any;

        // This loop will keep trying to connect until successful, with a delay between each iteration.
        while (connection === undefined) {
            if (this.closed) {
                throw new Error("Attempting to connect a closed DeltaManager");
            }
            connectRepeatCount++;

            try {
                this.client.mode = requestedMode;
                connection = await docService.connectToDeltaStream(this.client);

                if (connection.disposed) {
                    // Nobody observed this connection, so drop it on the floor and retry.
                    this.logger.sendTelemetryEvent({ eventName: "ReceivedClosedConnection" });
                    connection = undefined;
                }
            } catch (origError) {
                if (typeof origError === "object" && origError !== null &&
                    origError?.errorType === DeltaStreamConnectionForbiddenError.errorType) {
                    connection = new NoDeltaStream();
                    requestedMode = "read";
                    break;
                }

                // Socket.io error when we connect to wrong socket, or hit some multiplexing bug
                if (!canRetryOnError(origError)) {
                    const error = normalizeError(origError, { props: fatalConnectErrorProp });
                    this.props.closeHandler(error);
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
                            duration: TelemetryLogger.formatTick(performance.now() - connectStartTime),
                        },
                        origError);
                }

                lastError = origError;

                const retryDelayFromError = getRetryDelayFromError(origError);
                delayMs = retryDelayFromError ?? Math.min(delayMs * 2, MaxReconnectDelayInMs);

                if (retryDelayFromError !== undefined) {
                    this.props.reconnectionDelayHandler(retryDelayFromError, origError);
                }
                await waitForConnectedState(delayMs);
            }
        }

        // If we retried more than once, log an event about how long it took
        if (connectRepeatCount > 1) {
            this.logger.sendTelemetryEvent(
                {
                    eventName: "MultipleDeltaConnectionFailures",
                    attempts: connectRepeatCount,
                    duration: TelemetryLogger.formatTick(performance.now() - connectStartTime),
                },
                lastError,
            );
        }

        this.setupNewSuccessfulConnection(connection, requestedMode);
    }

    /**
     * Start the connection. Any error should result in container being close.
     * And report the error if it excape for any reason.
     * @param args - The connection arguments
     */
     private triggerConnect(connectionMode: ConnectionMode) {
        assert(this.connection === undefined, 0x239 /* "called only in disconnected state" */);
        if (this.reconnectMode !== ReconnectMode.Enabled) {
            return;
        }
        this.connect(connectionMode);
    }

    /**
     * Disconnect the current connection.
     * @param reason - Text description of disconnect reason to emit with disconnect event
     */
     private disconnectFromDeltaStream(reason: string): boolean {
        this.pendingReconnect = false;
        this.downgradedConnection = false;

        if (this.connection === undefined) {
            return false;
        }

        assert(!this.pendingConnection, 0x27b /* "reentrancy may result in incorrect behavior" */);

        const connection = this.connection;
        // Avoid any re-entrancy - clear object reference
        this.connection = undefined;

        // Remove listeners first so we don't try to retrigger this flow accidentally through reconnectOnError
        connection.off("op", this.opHandler);
        connection.off("signal", this.props.signalHandler);
        connection.off("nack", this.nackHandler);
        connection.off("disconnect", this.disconnectHandlerInternal);
        connection.off("error", this.errorHandler);
        connection.off("pong", this.props.pongHandler);

        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        this._outbound.pause();
        this._outbound.clear();
        this.props.disconnectHandler(reason);

        connection.dispose();

        this._connectionVerboseProps = {};

        return true;
    }

    /**
     * Once we've successfully gotten a connection, we need to set up state, attach event listeners, and process
     * initial messages.
     * @param connection - The newly established connection
     */
     private setupNewSuccessfulConnection(connection: IDocumentDeltaConnection, requestedMode: ConnectionMode) {
        // Old connection should have been cleaned up before establishing a new one
        assert(this.connection === undefined, 0x0e6 /* "old connection exists on new connection setup" */);
        assert(!connection.disposed, 0x28a /* "can't be disposed - Callers need to ensure that!" */);

        if (this.pendingConnection) {
            this.pendingConnection = false;
        } else {
            assert(this.closed, 0x27f /* "reentrancy may result in incorrect behavior" */);
        }
        this.connection = connection;

        // Does information in scopes & mode matches?
        // If we asked for "write" and got "read", then file is read-only
        // But if we ask read, server can still give us write.
        const readonly = !connection.claims.scopes.includes(ScopeType.DocWrite);

        // This connection mode validation logic is moving to the driver layer in 0.44.  These two asserts can be
        // removed after those packages have released and become ubiquitous.
        assert(requestedMode === "read" || readonly === (this.connectionMode === "read"),
            0x0e7 /* "claims/connectionMode mismatch" */);
        assert(!readonly || this.connectionMode === "read", 0x0e8 /* "readonly perf with write connection" */);

        this.set_readonlyPermissions(readonly);

        if (this.closed) {
            // Raise proper events, Log telemetry event and close connection.
            this.disconnectFromDeltaStream("ConnectionManager already closed");
            return;
        }

        this._outbound.resume();

        connection.on("op", this.opHandler);
        connection.on("signal", this.props.signalHandler);
        connection.on("nack", this.nackHandler);
        connection.on("disconnect", this.disconnectHandlerInternal);
        connection.on("error", this.errorHandler);
        connection.on("pong", this.props.pongHandler);

        // Initial messages are always sorted. However, due to early op handler installed by drivers and appending those
        // ops to initialMessages, resulting set is no longer sorted, which would result in client hitting storage to
        // fill in gap. We will recover by cancelling this request once we process remaining ops, but it's a waste that
        // we could avoid
        const initialMessages = connection.initialMessages.sort((a, b) => a.sequenceNumber - b.sequenceNumber);

        // Some storages may provide checkpointSequenceNumber to identify how far client is behind.
        let checkpointSequenceNumber = connection.checkpointSequenceNumber;

        this._connectionVerboseProps = {
            clientId: connection.clientId,
            mode: connection.mode,
        };

        // reset connection props
        this._connectionProps = {};

        if (connection.relayServiceAgent !== undefined) {
            this._connectionVerboseProps.relayServiceAgent = connection.relayServiceAgent;
            this._connectionProps.relayServiceAgent = connection.relayServiceAgent;
        }
        this._connectionProps.socketDocumentId = connection.claims.documentId;
        this._connectionProps.connectionMode = connection.mode;

        let last = -1;
        if (initialMessages.length !== 0) {
            this._connectionVerboseProps.connectionInitialOpsFrom = initialMessages[0].sequenceNumber;
            last = initialMessages[initialMessages.length - 1].sequenceNumber;
            this._connectionVerboseProps.connectionInitialOpsTo = last + 1;
            // Update knowledge of how far we are behind, before raising "connect" event
            // This is duplication of what incomingOpHandler() does, but we have to raise event before we get there,
            // so duplicating update logic here as well.
            if (checkpointSequenceNumber === undefined || checkpointSequenceNumber < last) {
                checkpointSequenceNumber = last;
            }
        }

        this.props.incomingOpHandler(
            initialMessages,
            this.connectFirstConnection ? "InitialOps" : "ReconnectOps");

        if (connection.initialSignals !== undefined) {
            for (const signal of connection.initialSignals) {
                this.props.signalHandler(signal);
            }
        }

        const details = ConnectionManager.detailsFromConnection(connection);
        details.checkpointSequenceNumber = checkpointSequenceNumber;
        this.props.connectHandler(details);

        this.connectFirstConnection = false;
    }

    /**
     * Disconnect the current connection and reconnect. Closes the container if it fails.
     * @param connection - The connection that wants to reconnect - no-op if it's different from this.connection
     * @param requestedMode - Read or write
     * @param error - Error reconnect information including whether or not to reconnect
     * @returns A promise that resolves when the connection is reestablished or we stop trying
     */
     private reconnectOnError(
        requestedMode: ConnectionMode,
        error: IAnyDriverError,
    ) {
        this.reconnect(
            requestedMode,
            error.message,
            error)
        .catch(this.props.closeHandler);
    }

    /**
     * Disconnect the current connection and reconnect.
     * @param connection - The connection that wants to reconnect - no-op if it's different from this.connection
     * @param requestedMode - Read or write
     * @param error - Error reconnect information including whether or not to reconnect
     * @returns A promise that resolves when the connection is reestablished or we stop trying
     */
    private async reconnect(
        requestedMode: ConnectionMode,
        disconnectMessage: string,
        error?: IAnyDriverError,
    ) {
        // We quite often get protocol errors before / after observing nack/disconnect
        // we do not want to run through same sequence twice.
        // If we're already disconnected/disconnecting it's not appropriate to call this again.
        assert(this.connection !== undefined, 0x0eb /* "Missing connection for reconnect" */);

        this.disconnectFromDeltaStream(disconnectMessage);

        // We will always trigger reconnect, even if canRetry is false.
        // Any truly fatal error state will result in container close upon attempted reconnect,
        // which is a preferable to closing abruptly when a live connection fails.
        if (error !== undefined && !error.canRetry) {
            this.logger.sendTelemetryEvent({
                eventName: "reconnectingDespiteFatalError",
                reconnectMode: this.reconnectMode,
             }, error);
        }

        if (this.reconnectMode === ReconnectMode.Never) {
            // Do not raise container error if we are closing just because we lost connection.
            // Those errors (like IdleDisconnect) would show up in telemetry dashboards and
            // are very misleading, as first initial reaction - some logic is broken.
            this.props.closeHandler();
        }

        // If closed then we can't reconnect
        if (this.closed || this.reconnectMode !== ReconnectMode.Enabled) {
            return;
        }

        const delayMs = getRetryDelayFromError(error);
        if (error !== undefined && delayMs !== undefined) {
            this.props.reconnectionDelayHandler(delayMs, error);
            await waitForConnectedState(delayMs);
        }

        this.triggerConnect(requestedMode);
    }

    public prepareMessageToSend(message: Omit<IDocumentMessage, "clientSequenceNumber">): IDocumentMessage | undefined {
        if (this.readonly === true) {
            assert(this.readOnlyInfo.readonly === true, 0x1f0 /* "Unexpected mismatch in readonly" */);
            const error = new GenericError("deltaManagerReadonlySubmit", undefined /* error */, {
                readonly: this.readOnlyInfo.readonly,
                forcedReadonly: this.readOnlyInfo.forced,
                readonlyPermissions: this.readOnlyInfo.permissions,
                storageOnly: this.readOnlyInfo.storageOnly,
            });
            this.props.closeHandler(error);
            return undefined;
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

        if (message.type === MessageType.NoOp) {
            this.trailingNoopCount++;
        } else {
            this.trailingNoopCount = 0;
        }

        return {
            ...message,
            clientSequenceNumber: ++this.clientSequenceNumber,
        };
    }

    public submitSignal(content: any) {
        if (this.connection !== undefined) {
            this.connection.submitSignal(content);
        } else {
            this.logger.sendErrorEvent({ eventName: "submitSignalDisconnected" });
        }
    }

    public sendMessages(messages: IDocumentMessage[]) {
        assert(this.connected, 0x2b4 /* "not connected on sending ops!" */);

        // If connection is "read" or implicit "read" (got leave op for "write" connection),
        // then op can't make it through - we will get a nack if op is sent.
        // We can short-circuit this process.
        // Note that we also want nacks to be rare and be treated as catastrophic failures.
        // Be careful with reentrancy though - disconnected event should not be be raised in the
        // middle of the current workflow, but rather on clean stack!
        if (this.connectionMode === "read" || this.downgradedConnection) {
            if (!this.pendingReconnect) {
                this.pendingReconnect = true;
                Promise.resolve().then(async () => {
                    if (this.pendingReconnect) { // still valid?
                        await this.reconnect(
                            "write", // connectionMode
                            "Switch to write", // message
                        );
                    }
                })
                .catch(() => {});
            }
            return;
        }

        assert(!this.pendingReconnect, 0x2b5 /* "logic error" */);

        this._outbound.push(messages);
    }

    public beforeProcessingIncomingOp(message: ISequencedDocumentMessage) {
        // if we have connection, and message is local, then we better treat is as local!
        assert(this.clientId !== message.clientId || this.lastSubmittedClientId === message.clientId,
            0x0ee /* "Not accounting local messages correctly" */,
        );

        if (this.lastSubmittedClientId !== undefined && this.lastSubmittedClientId === message.clientId) {
            const clientSequenceNumber = message.clientSequenceNumber;

            assert(this.clientSequenceNumberObserved < clientSequenceNumber, 0x0ef /* "client seq# not growing" */);
            assert(clientSequenceNumber <= this.clientSequenceNumber,
                0x0f0 /* "Incoming local client seq# > generated by this client" */);

            this.clientSequenceNumberObserved = clientSequenceNumber;
        }

        if (message.type === MessageType.ClientLeave) {
            const systemLeaveMessage = message as ISequencedDocumentSystemMessage;
            const clientId = JSON.parse(systemLeaveMessage.data) as string;
            if (clientId === this.clientId) {
                // We have been kicked out from quorum
                this.logger.sendPerformanceEvent({ eventName: "ReadConnectionTransition" });
                this.downgradedConnection = true;
            }
        }
    }

    private readonly opHandler = (documentId: string, messagesArg: ISequencedDocumentMessage[]) => {
        const messages = Array.isArray(messagesArg) ? messagesArg : [messagesArg];
        this.props.incomingOpHandler(messages, "opHandler");
    };

    // Always connect in write mode after getting nacked.
    private readonly nackHandler = (documentId: string, messages: INack[]) => {
        const message = messages[0];
        if (this._readonlyPermissions === true) {
            this.props.closeHandler(createWriteError("writeOnReadOnlyDocument", { driverVersion: undefined }));
            return;
        }

        const reconnectInfo = getNackReconnectInfo(message.content);

        // If the nack indicates we cannot retry, then close the container outright
        if (!reconnectInfo.canRetry) {
            this.props.closeHandler(reconnectInfo);
            return;
        }

        this.reconnectOnError(
            "write",
            reconnectInfo,
        );
    };

    // Connection mode is always read on disconnect/error unless the system mode was write.
    private readonly disconnectHandlerInternal = (disconnectReason: IAnyDriverError) => {
        // Note: we might get multiple disconnect calls on same socket, as early disconnect notification
        // ("server_disconnect", ODSP-specific) is mapped to "disconnect"
        this.reconnectOnError(
            this.defaultReconnectionMode,
            disconnectReason,
        );
    };

    private readonly errorHandler = (error: IAnyDriverError) => {
        this.reconnectOnError(
            this.defaultReconnectionMode,
            error,
        );
    };
}
