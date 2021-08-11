/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert , BatchManager, TypedEventEmitter } from "@fluidframework/common-utils";
import {
    IDocumentDeltaConnection,
    IDocumentDeltaConnectionEvents,
    DriverError,
} from "@fluidframework/driver-definitions";
import { createGenericNetworkError } from "@fluidframework/driver-utils";
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
import { ChildLogger } from "@fluidframework/telemetry-utils";
import { debug } from "./debug";

/**
 * Represents a connection to a stream of delta updates
 */
export class DocumentDeltaConnection
    extends TypedEventEmitter<IDocumentDeltaConnectionEvents>
    implements IDocumentDeltaConnection, IDisposable {
    static readonly eventsToForward = ["nack", "disconnect", "op", "signal", "pong", "error"];

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

    protected readonly submitManager: BatchManager<IDocumentMessage[]>;

    private _details: IConnected | undefined;

    // Listeners only needed while the connection is in progress
    private readonly connectionListeners: Map<string, (...args: any[]) => void> = new Map();
    // Listeners used throughout the lifetime of the DocumentDeltaConnection
    private readonly trackedListeners: Map<string, (...args: any[]) => void> = new Map();

    protected get hasDetails(): boolean {
        return !!this._details;
    }

    public get disposed() { return this._disposed; }
    /**
     * Flag to indicate whether the DocumentDeltaConnection is expected to still be capable of sending messages.
     * After disconnection, we flip this to prevent any stale messages from being emitted.
     */
    protected _disposed: boolean = false;
    protected readonly logger: ITelemetryLogger;

    public get details(): IConnected {
        if (!this._details) {
            throw new Error("Internal error: calling method before _details is initialized!");
        }
        return this._details;
    }

    /**
     * @param socket - websocket to be used
     * @param documentId - ID of the document
     */
    protected constructor(
        protected readonly socket: SocketIOClient.Socket,
        public documentId: string,
        logger: ITelemetryLogger,
    ) {
        super();

        this.logger = ChildLogger.create(logger, "DeltaConnection");

        this.submitManager = new BatchManager<IDocumentMessage[]>(
            (submitType, work) => {
                // Although the implementation here disconnects the socket and does not reuse it, other subclasses
                // (e.g. OdspDocumentDeltaConnection) may reuse the socket.  In these cases, we need to avoid emitting
                // on the still-live socket.
                if (!this.disposed) {
                    this.socket.emit(submitType, this.clientId, work);
                }
            });

        this.on("newListener", (event, listener) => {
            if (!DocumentDeltaConnection.eventsToForward.includes(event)) {
                throw new Error(`DocumentDeltaConnection: Registering for unknown event: ${event}`);
            }
            assert(!this.disposed, 0x20a /* "register for event on disposed object" */);

            // Register for the event on socket.io
            // "error" is special - we already subscribed to it to modify error object on the fly.
            if (event === "error") {
                return;
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
        return this.details.maxMessageSize;
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

    /**
     * Submits a new delta operation to the server
     *
     * @param message - delta operation to submit
     */
    public submit(messages: IDocumentMessage[]): void {
        this.checkNotClosed();
        this.submitManager.add("submitOp", messages);
    }

    /**
     * Submits a new signal to the server
     *
     * @param message - signal to submit
     */
    public submitSignal(message: IDocumentMessage): void {
        this.checkNotClosed();
        this.submitManager.add("submitSignal", [message]);
    }

    /**
     * Disconnect from the websocket, and permanently disable this DocumentDeltaConnection.
     */
    public dispose() {
        this.disposeCore(
            false, // socketProtocolError
            createGenericNetworkError("client closing connection", true /* canRetry */));
    }

    // back-compat: became @deprecated in 0.45 / driver-definitions 0.40
    public close() { this.dispose(); }

    protected disposeCore(socketProtocolError: boolean, err: DriverError) {
        if (this.disposed) {
            // We see cases where socket is disposed while we have two "disconnect" listeners - one from DeltaManager,
            // one - early handler that should have been removed on establishing connection. This causes asserts in
            // OdspDocumentDeltaConnection.disconnect() due to not expectting two calls.
            this.logger.sendErrorEvent(
                {
                    eventName: "DoubleClose",
                    connectionEvents: this.connectionListeners.size,
                    trackedEvents: this.trackedListeners.size,
                    socketProtocolError,
                },
                err);
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
    protected disconnect(socketProtocolError: boolean, reason: DriverError) {
        this.socket.disconnect();
    }

    protected async initialize(connectMessage: IConnect, timeout: number) {
        this.socket.on("op", this.earlyOpHandler);
        this.socket.on("signal", this.earlySignalHandler);
        this.earlyOpHandlerAttached = true;

        let success = false;

        this._details = await new Promise<IConnected>((resolve, reject) => {
            const fail = (socketProtocolError: boolean, err: DriverError) => {
                // timeout & "error" can happen after successful connection
                if (!success) {
                    this.disposeCore(socketProtocolError, err);
                }
                reject(err);
            };

            // Listen for connection issues
            this.addConnectionListener("connect_error", (error) => {
                fail(true, this.createErrorObject("connect_error", error));
            });

            // Listen for timeouts
            this.addConnectionListener("connect_timeout", () => {
                fail(true, this.createErrorObject("connect_timeout"));
            });

            // Socket can be disconnected while waiting for Fluid protocol messages
            // (connect_document_error / connect_document_success)
            this.addConnectionListener("disconnect", (reason) => {
                fail(true, this.createErrorObject("disconnect", reason));
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
                success = true;
            });

            // WARNING: this has to stay as addTrackedListener listener and not be removed after successful connection.
            // Reason: this.on() implementation does not subscribe to "error" socket events to propagate it to consumers
            // of this class - it relies on this code to do so.
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
                fail(false, this.createErrorObject("Timeout waiting for handshake from ordering service"));
            }, timeout + 2000);
        });
    }

    protected earlyOpHandler = (documentId: string, msgs: ISequencedDocumentMessage[]) => {
        debug("Queued early ops", msgs.length);
        this.queuedMessages.push(...msgs);
    };

    protected earlySignalHandler = (msg: ISignalMessage) => {
        debug("Queued early signals");
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
    protected createErrorObject(handler: string, error?: any, canRetry = true): DriverError {
        // Note: we suspect the incoming error object is either:
        // - a string: log it in the message (if not a string, it may contain PII but will print as [object Object])
        // - a socketError: add it to the OdspError object for driver to be able to parse it and reason
        //   over it.
        let message = `socket.io: ${handler}`;
        if (typeof error === "string") {
            message = `${message}: ${error}`;
        }
        const errorObj = createGenericNetworkError(
            message,
            canRetry,
        );

        return errorObj;
    }
}
