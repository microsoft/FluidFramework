/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, TypedEventEmitter } from "@fluidframework/common-utils";
import {
    IDocumentDeltaConnection,
    IDocumentDeltaConnectionEvents,
} from "@fluidframework/driver-definitions";
import { createGenericNetworkError, IAnyDriverError } from "@fluidframework/driver-utils";
import {
    ConnectionMode,
    IClientConfiguration,
    IConnect,
    IConnected,
    IDocumentMessage,
    ISequencedDocumentMessage,
    ISignalClient,
    ISignalMessage,
    ITokenClaims,
    ScopeType,
} from "@fluidframework/protocol-definitions";
import { IDisposable, ITelemetryLogger } from "@fluidframework/common-definitions";
import {
    ChildLogger,
    getCircularReplacer,
    loggerToMonitoringContext,
    MonitoringContext,
} from "@fluidframework/telemetry-utils";
import type { Socket } from "socket.io-client";
// For now, this package is versioned and released in unison with the specific drivers
import { pkgVersion as driverVersion } from "./packageVersion";

/**
 * Represents a connection to a stream of delta updates
 */
export class DocumentDeltaConnection
    extends TypedEventEmitter<IDocumentDeltaConnectionEvents>
    implements IDocumentDeltaConnection, IDisposable {
    static readonly eventsToForward = ["nack", "op", "signal", "pong"];

    // WARNING: These are critical events that we can't miss, so registration for them has to be in place at all times!
    // Including before handshake is over, and after that (but before DeltaManager had a chance to put its own handlers)
    static readonly eventsAlwaysForwarded = ["disconnect", "error"];

    /**
     * Last known sequence number to ordering service at the time of connection
     * It may lap actual last sequence number (quite a bit, if container  is very active).
     * But it's best information for client to figure out how far it is behind, at least
     * for "read" connections. "write" connections may use own "join" op to similar information,
     * that is likely to be more up-to-date.
     */
    public checkpointSequenceNumber: number | undefined;

    // Listen for ops sent before we receive a response to connect_document
    protected readonly queuedMessages: ISequencedDocumentMessage[] = [];
    protected readonly queuedSignals: ISignalMessage[] = [];
    /**
     * A flag to indicate whether we have our handler attached.  If it's attached, we're queueing incoming ops
     * to later be retrieved via initialMessages.
     */
    private earlyOpHandlerAttached: boolean = false;

    private socketConnectionTimeout: ReturnType<typeof setTimeout> | undefined;

    private _details: IConnected | undefined;

    private reconnectAttempts: number = 0;

    // Listeners only needed while the connection is in progress
    private readonly connectionListeners: Map<string, (...args: any[]) => void> = new Map();
    // Listeners used throughout the lifetime of the DocumentDeltaConnection
    private readonly trackedListeners: Map<string, (...args: any[]) => void> = new Map();

    protected get hasDetails(): boolean {
        return !!this._details;
    }

    public get disposed() {
        assert(this._disposed || this.socket.connected, 0x244 /* "Socket is closed, but connection is not!" */);
        return this._disposed;
    }
    /**
     * Flag to indicate whether the DocumentDeltaConnection is expected to still be capable of sending messages.
     * After disconnection, we flip this to prevent any stale messages from being emitted.
     */
    protected _disposed: boolean = false;
    private readonly mc: MonitoringContext;
    /**
     * @deprecated - Implementors should manage their own logger or monitoring context
     */
    protected get logger(): ITelemetryLogger {
        return this.mc.logger;
    }

    public get details(): IConnected {
        if (!this._details) {
            throw new Error("Internal error: calling method before _details is initialized!");
        }
        return this._details;
    }

    /**
     * @param socket - websocket to be used
     * @param documentId - ID of the document
     * @param logger - for reporting telemetry events
     * @param enableLongPollingDowngrades - allow connection to be downgraded to long-polling on websocket failure
     */
    protected constructor(
        protected readonly socket: Socket,
        public documentId: string,
        logger: ITelemetryLogger,
        private readonly enableLongPollingDowngrades: boolean = false,
    ) {
        super();

        this.mc = loggerToMonitoringContext(
            ChildLogger.create(logger, "DeltaConnection"));

        this.on("newListener", (event, listener) => {
            assert(!this.disposed, 0x20a /* "register for event on disposed object" */);

            // Some events are already forwarded - see this.addTrackedListener() calls in initialize().
            if (DocumentDeltaConnection.eventsAlwaysForwarded.includes(event)) {
                assert(this.trackedListeners.has(event), 0x245 /* "tracked listener" */);
                return;
            }

            if (!DocumentDeltaConnection.eventsToForward.includes(event)) {
                throw new Error(`DocumentDeltaConnection: Registering for unknown event: ${event}`);
            }

            // Whenever listener is added, we should subscribe on same event on socket, so these two things
            // should be in sync. This currently assumes that nobody unregisters and registers back listeners,
            // and that there are no "internal" listeners installed (like "error" case we skip above)
            // Better flow might be to always unconditionally register all handlers on successful connection,
            // though some logic (naming assert in initialMessages getter) might need to be adjusted (it becomes noop)
            assert((this.listeners(event).length !== 0) === this.trackedListeners.has(event), 0x20b /* "mismatch" */);
            if (!this.trackedListeners.has(event)) {
                this.addTrackedListener(
                    event,
                    (...args: any[]) => {
                        this.emit(event, ...args);
                    });
            }
        });
    }

    /**
     * Get the ID of the client who is sending the message
     *
     * @returns the client ID
     */
    public get clientId(): string {
        return this.details.clientId;
    }

    /**
     * Get the mode of the client
     *
     * @returns the client mode
     */
    public get mode(): ConnectionMode {
        return this.details.mode;
    }

    /**
     * Get the claims of the client who is sending the message
     *
     * @returns client claims
     */
    public get claims(): ITokenClaims {
        return this.details.claims;
    }

    /**
     * Get whether or not this is an existing document
     *
     * @returns true if the document exists
     */
    public get existing(): boolean {
        return this.details.existing;
    }

    /**
     * Get the maximum size of a message before chunking is required
     *
     * @returns the maximum size of a message before chunking is required
     */
    public get maxMessageSize(): number {
        return this.details.serviceConfiguration.maxMessageSize;
    }

    /**
     * Semver of protocol being used with the service
     */
    public get version(): string {
        return this.details.version;
    }

    /**
     * Configuration details provided by the service
     */
    public get serviceConfiguration(): IClientConfiguration {
        return this.details.serviceConfiguration;
    }

    private checkNotClosed() {
        assert(!this.disposed, 0x20c /* "connection disposed" */);
    }

    /**
     * Get messages sent during the connection
     *
     * @returns messages sent during the connection
     */
    public get initialMessages(): ISequencedDocumentMessage[] {
        this.checkNotClosed();

        // If we call this when the earlyOpHandler is not attached, then the queuedMessages may not include the
        // latest ops.  This could possibly indicate that initialMessages was called twice.
        assert(this.earlyOpHandlerAttached, 0x08e /* "Potentially missed initial messages" */);
        // We will lose ops and perf will tank as we need to go to storage to become current!
        assert(this.listeners("op").length !== 0, 0x08f /* "No op handler is setup!" */);

        this.removeEarlyOpHandler();

        if (this.queuedMessages.length > 0) {
            // Some messages were queued.
            // add them to the list of initialMessages to be processed
            this.details.initialMessages.push(...this.queuedMessages);
            this.details.initialMessages.sort((a, b) => a.sequenceNumber - b.sequenceNumber);
            this.queuedMessages.length = 0;
        }
        return this.details.initialMessages;
    }

    /**
     * Get signals sent during the connection
     *
     * @returns signals sent during the connection
     */
    public get initialSignals(): ISignalMessage[] {
        this.checkNotClosed();
        assert(this.listeners("signal").length !== 0, 0x090 /* "No signal handler is setup!" */);

        this.removeEarlySignalHandler();

        if (this.queuedSignals.length > 0) {
            // Some signals were queued.
            // add them to the list of initialSignals to be processed
            this.details.initialSignals.push(...this.queuedSignals);
            this.queuedSignals.length = 0;
        }
        return this.details.initialSignals;
    }

    /**
     * Get initial client list
     *
     * @returns initial client list sent during the connection
     */
    public get initialClients(): ISignalClient[] {
        this.checkNotClosed();
        return this.details.initialClients;
    }

    protected emitMessages(type: string, messages: IDocumentMessage[][]) {
        // Although the implementation here disconnects the socket and does not reuse it, other subclasses
        // (e.g. OdspDocumentDeltaConnection) may reuse the socket.  In these cases, we need to avoid emitting
        // on the still-live socket.
        if (!this.disposed) {
            this.socket.emit(type, this.clientId, messages);
        }
    }

    protected submitCore(type: string, messages: IDocumentMessage[]) {
        this.emitMessages(type, [messages]);
    }

    /**
     * Submits a new delta operation to the server
     *
     * @param message - delta operation to submit
     */
    public submit(messages: IDocumentMessage[]): void {
        this.checkNotClosed();
        this.submitCore("submitOp", messages);
    }

    /**
     * Submits a new signal to the server
     *
     * @param message - signal to submit
     */
    public submitSignal(message: IDocumentMessage): void {
        this.checkNotClosed();
        this.submitCore("submitSignal", [message]);
    }

    /**
     * Disconnect from the websocket, and permanently disable this DocumentDeltaConnection.
     */
    public dispose() {
        this.disposeCore(
            false, // socketProtocolError
            createGenericNetworkError(
                // pre-0.58 error message: clientClosingConnection
                "Client closing delta connection", { canRetry: true }, { driverVersion }));
    }

    protected disposeCore(socketProtocolError: boolean, err: IAnyDriverError) {
        // Can't check this.disposed here, as we get here on socket closure,
        // so _disposed & socket.connected might be not in sync while processing
        // "dispose" event.
        if (this._disposed) {
            return;
        }

        // We set the disposed flag as a part of the contract for overriding the disconnect method. This is used by
        // DocumentDeltaConnection to determine if emitting messages (ops) on the socket is allowed, which is
        // important since OdspDocumentDeltaConnection reuses the socket rather than truly disconnecting it. Note that
        // OdspDocumentDeltaConnection may still send disconnect_document which is allowed; this is only intended
        // to prevent normal messages from being emitted.
        this._disposed = true;

        this.removeTrackedListeners();
        this.disconnect(socketProtocolError, err);
    }

    /**
     * Disconnect from the websocket.
     * @param socketProtocolError - true if error happened on socket / socket.io protocol level
     *  (not on Fluid protocol level)
     * @param reason - reason for disconnect
     */
    protected disconnect(socketProtocolError: boolean, reason: IAnyDriverError) {
        this.socket.disconnect();
    }

    protected async initialize(connectMessage: IConnect, timeout: number) {
        this.socket.on("op", this.earlyOpHandler);
        this.socket.on("signal", this.earlySignalHandler);
        this.earlyOpHandlerAttached = true;

        this._details = await new Promise<IConnected>((resolve, reject) => {
            const fail = (socketProtocolError: boolean, err: IAnyDriverError) => {
                this.disposeCore(socketProtocolError, err);
                reject(err);
            };

            // Listen for connection issues
            this.addConnectionListener("connect_error", (error) => {
                let isWebSocketTransportError = false;
                try {
                    const description = error?.description;
                    if (description && typeof description === "object") {
                        if (error.type === "TransportError") {
                            isWebSocketTransportError = true;
                        }
                        // That's a WebSocket. Clear it as we can't log it.
                        description.target = undefined;
                    }
                } catch(_e) {}

                // Handle socket transport downgrading.
                if (isWebSocketTransportError &&
                    this.enableLongPollingDowngrades &&
                    this.socket.io.opts.transports?.[0] !== "polling") {
                    // Downgrade transports to polling upgrade mechanism.
                    this.socket.io.opts.transports = ["polling", "websocket"];
                    // Don't alter reconnection behavior if already enabled.
                    if (!this.socket.io.reconnection()) {
                        // Allow single reconnection attempt using polling upgrade mechanism.
                        this.socket.io.reconnection(true);
                        this.socket.io.reconnectionAttempts(1);
                    }
                }

                // Allow built-in socket.io reconnection handling.
                if (this.socket.io.reconnection() &&
                    this.reconnectAttempts < this.socket.io.reconnectionAttempts()) {
                    // Reconnection is enabled and maximum reconnect attempts have not been reached.
                    return;
                }

                fail(true, this.createErrorObject("connect_error", error));
            });

            this.addConnectionListener("reconnect_attempt", () => {
                this.reconnectAttempts++;
            });

            // Listen for timeouts
            this.addConnectionListener("connect_timeout", () => {
                fail(true, this.createErrorObject("connect_timeout"));
            });

            this.addConnectionListener("connect_document_success", (response: IConnected) => {
                // If we sent a nonce and the server supports nonces, check that the nonces match
                if (connectMessage.nonce !== undefined &&
                    response.nonce !== undefined &&
                    response.nonce !== connectMessage.nonce) {
                    return;
                }

                const requestedMode = connectMessage.mode;
                const actualMode = response.mode;
                const writingPermitted = response.claims.scopes.includes(ScopeType.DocWrite);

                if (writingPermitted) {
                    // The only time we expect a mismatch in requested/actual is if we lack write permissions
                    // In this case we will get "read", even if we requested "write"
                    if (actualMode !== requestedMode) {
                        fail(false, this.createErrorObject(
                            "connect_document_success",
                            "Connected in a different mode than was requested",
                            false,
                        ));
                        return;
                    }
                } else {
                    if (actualMode === "write") {
                        fail(false, this.createErrorObject(
                            "connect_document_success",
                            "Connected in write mode without write permissions",
                            false,
                        ));
                        return;
                    }
                }

                this.checkpointSequenceNumber = response.checkpointSequenceNumber;

                this.removeConnectionListeners();
                resolve(response);
            });

            // Socket can be disconnected while waiting for Fluid protocol messages
            // (connect_document_error / connect_document_success), as well as before DeltaManager
            // had a chance to register its handlers.
            this.addTrackedListener("disconnect", (reason) => {
                const err = this.createErrorObject("disconnect", reason);
                this.emit("disconnect", err);
                fail(true, err);
            });

            this.addTrackedListener("error", ((error) => {
                // First, raise an error event, to give clients a chance to observe error contents
                // This includes "Invalid namespace" error, which we consider critical (reconnecting will not help)
                const err = this.createErrorObject("error", error, error !== "Invalid namespace");
                this.emit("error", err);
                // Disconnect socket - required if happened before initial handshake
                fail(true, err);
            }));

            this.addConnectionListener("connect_document_error", ((error) => {
                // If we sent a nonce and the server supports nonces, check that the nonces match
                if (connectMessage.nonce !== undefined &&
                    error.nonce !== undefined &&
                    error.nonce !== connectMessage.nonce) {
                    return;
                }

                // This is not an socket.io error - it's Fluid protocol error.
                // In this case fail connection and indicate that we were unable to create connection
                fail(false, this.createErrorObject("connect_document_error", error));
            }));

            this.socket.emit("connect_document", connectMessage);

            // Give extra 2 seconds for handshake on top of socket connection timeout
            this.socketConnectionTimeout = setTimeout(() => {
                fail(false, this.createErrorObject("orderingServiceHandshakeTimeout"));
            }, timeout + 2000);
        });

        assert(!this.disposed, 0x246 /* "checking consistency of socket & _disposed flags" */);
    }

    protected earlyOpHandler = (documentId: string, msgs: ISequencedDocumentMessage[]) => {
        this.queuedMessages.push(...msgs);
    };

    protected earlySignalHandler = (msg: ISignalMessage) => {
        this.queuedSignals.push(msg);
    };

    private removeEarlyOpHandler() {
        this.socket.removeListener("op", this.earlyOpHandler);
        this.earlyOpHandlerAttached = false;
    }

    private removeEarlySignalHandler() {
        this.socket.removeListener("signal", this.earlySignalHandler);
    }

    private addConnectionListener(event: string, listener: (...args: any[]) => void) {
        assert(!DocumentDeltaConnection.eventsAlwaysForwarded.includes(event),
            0x247 /* "Use addTrackedListener instead" */);
        assert(!DocumentDeltaConnection.eventsToForward.includes(event),
            0x248 /* "should not subscribe to forwarded events" */);
        this.socket.on(event, listener);
        assert(!this.connectionListeners.has(event), 0x20d /* "double connection listener" */);
        this.connectionListeners.set(event, listener);
    }

    protected addTrackedListener(event: string, listener: (...args: any[]) => void) {
        this.socket.on(event, listener);
        assert(!this.trackedListeners.has(event), 0x20e /* "double tracked listener" */);
        this.trackedListeners.set(event, listener);
    }

    private removeTrackedListeners() {
        for (const [event, listener] of this.trackedListeners.entries()) {
            this.socket.off(event, listener);
        }
        // removeTrackedListeners removes all listeners, including connection listeners
        this.removeConnectionListeners();

        this.removeEarlyOpHandler();
        this.removeEarlySignalHandler();

        this.trackedListeners.clear();
    }

    private removeConnectionListeners() {
        if (this.socketConnectionTimeout !== undefined) {
            clearTimeout(this.socketConnectionTimeout);
        }

        for (const [event, listener] of this.connectionListeners.entries()) {
            this.socket.off(event, listener);
        }
        this.connectionListeners.clear();
    }

    /**
     * Error raising for socket.io issues
     */
    protected createErrorObject(handler: string, error?: any, canRetry = true): IAnyDriverError {
        // Note: we suspect the incoming error object is either:
        // - a string: log it in the message (if not a string, it may contain PII but will print as [object Object])
        // - an Error object thrown by socket.io engine. Be careful with not recording PII!
        let message: string;
        if (typeof error !== "object") {
            message = `${error}`;
        } else if (error?.type === "TransportError") {
            // JSON.stringify drops Error.message
            const messagePrefix = (error?.message !== undefined)
                ? `${error.message}: `
                : "";

            // Websocket errors reported by engine.io-client.
            // They are Error objects with description containing WS error and description = "TransportError"
            // Please see https://github.com/socketio/engine.io-client/blob/7245b80/lib/transport.ts#L44,
            message = `${messagePrefix}${JSON.stringify(error, getCircularReplacer())}`;
        } else {
            message = "[object omitted]";
        }
        const errorObj = createGenericNetworkError(
            `socket.io (${handler}): ${message}`,
            { canRetry },
            { driverVersion },
        );

        return errorObj;
    }
}
