/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as assert from "assert";
import { BatchManager, TypedEventEmitter } from "@microsoft/fluid-common-utils";
import { IDocumentDeltaConnection, IError, IDocumentDeltaConnectionEvents } from "@microsoft/fluid-driver-definitions";
import { createNetworkError } from "@microsoft/fluid-driver-utils";
import {
    ConnectionMode,
    IClient,
    IConnect,
    IConnected,
    IContentMessage,
    IDocumentMessage,
    ISequencedDocumentMessage,
    IServiceConfiguration,
    ISignalClient,
    ISignalMessage,
    ITokenClaims,
} from "@microsoft/fluid-protocol-definitions";
import { debug } from "./debug";

const protocolVersions = ["^0.4.0", "^0.3.0", "^0.2.0", "^0.1.0"];

/**
 * Error raising for socket.io issues
 */
function createErrorObject(handler: string, error: any, canRetry = true) {
    // Note: we suspect the incoming error object is either:
    // - a string: log it in the message (if not a string, it may contain PII but will print as [object Object])
    // - a socketError: add it to the IError object for driver to be able to parse it and reason over it.
    const errorObj: IError = createNetworkError(
        `socket.io error: ${handler}: ${error}`,
        canRetry,
    );

    (errorObj as any).socketError = error;
    return errorObj;
}

interface IEventListener {
    event: string;
    connectionListener: boolean; // True if this event listener only needed while connection is in progress
    listener(...args: any[]): void;
}

/**
 * Represents a connection to a stream of delta updates
 */
export class DocumentDeltaConnection
    extends TypedEventEmitter<IDocumentDeltaConnectionEvents>
    implements IDocumentDeltaConnection  {
    /**
     * Create a DocumentDeltaConnection
     *
     * @param tenantId - the ID of the tenant
     * @param id - document ID
     * @param token - authorization token for storage service
     * @param io - websocket library
     * @param client - information about the client
     * @param mode - connection mode
     * @param url - websocket URL
     * @param timeoutMs - timeout for socket connection attempt in milliseconds (default: 20000)
     */
    public static async create(
        tenantId: string,
        id: string,
        token: string | null,
        io: SocketIOClientStatic,
        client: IClient,
        url: string,
        timeoutMs: number = 20000): Promise<IDocumentDeltaConnection> {

        const socket = io(
            url,
            {
                query: {
                    documentId: id,
                    tenantId,
                },
                reconnection: false,
                transports: ["websocket"],
                timeout: timeoutMs,
            });

        const connectMessage: IConnect = {
            client,
            id,
            mode: client.mode,
            tenantId,
            token,  // Token is going to indicate tenant level information, etc...
            versions: protocolVersions,
        };

        const deltaConnection = new DocumentDeltaConnection(socket, id);

        await deltaConnection.initialize(connectMessage, timeoutMs);
        return deltaConnection;
    }

    // Listen for ops sent before we receive a response to connect_document
    private readonly queuedMessages: ISequencedDocumentMessage[] = [];
    private readonly queuedContents: IContentMessage[] = [];
    private readonly queuedSignals: ISignalMessage[] = [];

    private readonly submitManager: BatchManager<IDocumentMessage[]>;

    private _details: IConnected | undefined;

    private trackedListeners: IEventListener[] = [];

    private get details(): IConnected {
        if (!this._details) {
            throw new Error("Internal error: calling method before _details is initialized!");
        }
        return this._details;
    }

    /**
     * @param socket - websocket to be used
     * @param documentId - ID of the document
     * @param details - details of the websocket connection
     */
    protected constructor(
        private readonly socket: SocketIOClient.Socket,
        public documentId: string) {
        super();

        this.submitManager = new BatchManager<IDocumentMessage[]>(
            (submitType, work) => {
                this.socket.emit(submitType, this.clientId, work);
            });

        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        this.socket.on("op", this.earlyOpHandler!);
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        this.socket.on("op-content", this.earlyContentHandler!);
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        this.socket.on("signal", this.earlySignalHandler!);

        this.on("newListener",(event,listener)=>{
            assert(this.listeners(event).length === 0, "re-registration of events is not implemented");

            // Register for the event on socket.io
            // "error" is special - we already subscribed to it to modify error object on the fly.
            if (event !== "error") {
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
     * Get the parent branch for the document
     *
     * @returns the parent branch
     */
    public get parentBranch(): string | null {
        return this.details.parentBranch;
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
    public get serviceConfiguration(): IServiceConfiguration {
        return this.details.serviceConfiguration;
    }

    /**
     * Get messages sent during the connection
     *
     * @returns messages sent during the connection
     */
    public get initialMessages(): ISequencedDocumentMessage[] {
        this.removeEarlyOpHandler();

        assert(this.listeners("op").length !== 0, "No op handler is setup!");

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
     * Get contents sent during the connection
     *
     * @returns contents sent during the connection
     */
    public get initialContents(): IContentMessage[] {
        this.removeEarlyContentsHandler();

        assert(this.listeners("op-content").length !== 0, "No op-content handler is setup!");

        if (this.queuedContents.length > 0) {
            this.details.initialContents.push(...this.queuedContents);

            this.details.initialContents.sort((a, b) =>
                // tslint:disable-next-line:strict-boolean-expressions
                (a.clientId === b.clientId) ? 0 : ((a.clientId < b.clientId) ? -1 : 1) ||
                    a.clientSequenceNumber - b.clientSequenceNumber);
            this.queuedContents.length = 0;
        }

        return this.details.initialContents;
    }

    /**
     * Get signals sent during the connection
     *
     * @returns signals sent during the connection
     */
    public get initialSignals(): ISignalMessage[] {
        this.removeEarlySignalHandler();

        assert(this.listeners("signal").length !== 0, "No signal handler is setup!");

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
        return this.details.initialClients;
    }

    /**
     * Submits a new delta operation to the server
     *
     * @param message - delta operation to submit
     */
    public submit(messages: IDocumentMessage[]): void {
        this.submitManager.add("submitOp", messages);
    }

    /**
     * Submits a new message to the server without queueing
     *
     * @param message - message to submit
     */
    public async submitAsync(messages: IDocumentMessage[]): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            this.socket.emit(
                "submitContent",
                this.clientId,
                messages,
                (error) => {
                    if (error) {
                        reject();
                    } else {
                        resolve();
                    }
                });
        });
    }

    /**
     * Submits a new signal to the server
     *
     * @param message - signal to submit
     */
    public submitSignal(message: IDocumentMessage): void {
        this.submitManager.add("submitSignal", [message]);
    }

    /**
     * Disconnect from the websocket
     * @param socketProtocolError - true if error happened on socket / socket.io protocol level
     *  (not on Fluid protocol level)
     */
    public disconnect(socketProtocolError: boolean = false) {
        this.removeTrackedListeners(false);
        this.socket.disconnect();
    }

    protected async initialize(connectMessage: IConnect, timeout: number) {
        this._details = await new Promise<IConnected>((resolve, reject) => {
            // Listen for connection issues
            this.addConnectionListener("connect_error", (error) => {
                debug(`Socket connection error: [${error}]`);
                this.disconnect(true);
                reject(createErrorObject("connect_error", error));
            });

            // Listen for timeouts
            this.addConnectionListener("connect_timeout", () => {
                this.disconnect(true);
                reject(createErrorObject("connect_timeout", "Socket connection timed out"));
            });

            // Socket can be disconnected while waiting for Fluid protocol messages
            // (connect_document_error / connect_document_success)
            this.addConnectionListener("disconnect", (reason) => {
                this.disconnect(true);
                reject(createErrorObject("disconnect", reason));
            });

            this.addConnectionListener("connect_document_success", (response: IConnected) => {
                /* Issue #1566: Backward compat */
                if (response.initialMessages === undefined) {
                    response.initialMessages = [];
                }
                if (response.initialClients === undefined) {
                    response.initialClients = [];
                }
                if (response.initialContents === undefined) {
                    response.initialContents = [];
                }
                if (response.initialSignals === undefined) {
                    response.initialSignals = [];
                }

                this.removeTrackedListeners(true);
                resolve(response);
            });

            // WARNING: this has to stay as addTrackedListener listener and not be removed after successful connection.
            // Reason: this.on() implementation does not subscribe to "error" socket events to propagate it to consumers
            // of this class - it relies on this code to do so.
            this.addTrackedListener("error", ((error) => {
                // First, raise an error event, to give clients a chance to observe error contents
                // This includes "Invalid namespace" error, which we consider critical (reconnecting will not help)
                const errorObj = createErrorObject("error", error, error !== "Invalid namespace");
                reject(errorObj);
                this.emit("error", errorObj);

                // Safety net - disconnect socket if client did not do so as result of processing "error" event.
                this.disconnect(true);
            }));

            this.addConnectionListener("connect_document_error", ((error) => {
                // This is not an error for the socket - it's a protocol error.
                // In this case we disconnect the socket and indicate that we were unable to create the
                // DocumentDeltaConnection.
                this.disconnect(false);
                reject(createErrorObject("connect_document_error", error));
            }));

            this.socket.emit("connect_document", connectMessage);

            // Give extra 2 seconds for handshake on top of socket connection timeout
            setTimeout(() => {
                reject(createErrorObject("Timeout waiting for handshake from ordering service", undefined));
            }, timeout + 2000);
        });
    }

    private earlyOpHandler ?= (documentId: string, msgs: ISequencedDocumentMessage[]) => {
        debug("Queued early ops", msgs.length);
        this.queuedMessages.push(...msgs);
    };

    private earlyContentHandler ?= (msg: IContentMessage) => {
        debug("Queued early contents");
        this.queuedContents.push(msg);
    };

    private earlySignalHandler ?= (msg: ISignalMessage) => {
        debug("Queued early signals");
        this.queuedSignals.push(msg);
    };

    private removeEarlyOpHandler() {
        if (this.earlyOpHandler) {
            this.socket.removeListener("op", this.earlyOpHandler);
            this.earlyOpHandler = undefined;
        }
    }

    private removeEarlyContentsHandler() {
        if (this.earlyContentHandler) {
            this.socket.removeListener("op-content", this.earlyContentHandler);
            this.earlyContentHandler = undefined;
        }
    }

    private removeEarlySignalHandler() {
        if (this.earlySignalHandler) {
            this.socket.removeListener("signal", this.earlySignalHandler);
            this.earlySignalHandler = undefined;
        }
    }

    private addConnectionListener(event: string, listener: (...args: any[]) => void) {
        this.socket.on(event, listener);
        this.trackedListeners.push({ event, connectionListener: true, listener });
    }

    private addTrackedListener(event: string, listener: (...args: any[]) => void) {
        this.socket.on(event, listener);
        this.trackedListeners.push({ event, connectionListener: true, listener });
    }

    private removeTrackedListeners(connectionListenerOnly) {
        const remaining: IEventListener[] = [];
        for (const { event, connectionListener, listener } of this.trackedListeners) {
            if (!connectionListenerOnly || connectionListener) {
                this.socket.off(event, listener);
            } else {
                remaining.push({ event, connectionListener, listener });
            }
        }
        this.trackedListeners = remaining;

        if (!connectionListenerOnly) {
            this.removeEarlyOpHandler();
            this.removeEarlyContentsHandler();
            this.removeEarlySignalHandler();
        }
    }
}
