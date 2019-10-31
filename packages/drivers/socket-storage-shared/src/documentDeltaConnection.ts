/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { BatchManager, NetworkError } from "@microsoft/fluid-core-utils";
import {
    ConnectionMode,
    IClient,
    IContentMessage,
    IDocumentDeltaConnection,
    IDocumentMessage,
    ISequencedDocumentMessage,
    IServiceConfiguration,
    ISignalClient,
    ISignalMessage,
    ITokenClaims,
} from "@microsoft/fluid-protocol-definitions";
import * as assert from "assert";
import { EventEmitter } from "events";
import { debug } from "./debug";
import { IConnect, IConnected } from "./messages";

const protocolVersions = ["^0.3.0", "^0.2.0", "^0.1.0"];

/**
 * Error raising for socket.io issues
 */
function createErrorObject(handler: string, error: any, canRetry = true) {
    // Note: we assume error object is a string here.
    // If it's not (and it's an object), we would not get its content.
    // That is likely Ok, as it may contain PII that will get logged to telemetry,
    // so we do not want it there.
    const errorObj = new NetworkError(
        `socket.io error: ${handler}: ${error}`,
        undefined,
        canRetry,
    );

    // Add actual error object, for driver to be able to parse it and reason over it.
    (errorObj as any).socketError = error;

    return errorObj;
}

/**
 * Represents a connection to a stream of delta updates
 */
export class DocumentDeltaConnection extends EventEmitter implements IDocumentDeltaConnection {
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
    // tslint:disable-next-line: max-func-body-length
    public static async create(
        tenantId: string,
        id: string,
        token: string | null,
        io: SocketIOClientStatic,
        client: IClient,
        mode: ConnectionMode,
        url: string,
        timeoutMs: number = 20000): Promise<IDocumentDeltaConnection> {

        // Note on multiplex = false:
        // Temp fix to address issues on SPO. Scriptor hits same URL for Fluid & Notifications.
        // As result Socket.io reuses socket (as there is no collision on namespaces).
        // ODSP does not currently supports multiple namespaces on same socket :(
        const socket = io(
            url,
            {
                multiplex: false,
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
            mode,
            tenantId,
            token,  // token is going to indicate tenant level information, etc...
            versions: protocolVersions,
        };

        const deltaConnection = new DocumentDeltaConnection(socket, id);

        await deltaConnection.initialize(connectMessage);
        return deltaConnection;
    }

    // Listen for ops sent before we receive a response to connect_document
    private readonly queuedMessages: ISequencedDocumentMessage[] = [];
    private readonly queuedContents: IContentMessage[] = [];
    private readonly queuedSignals: ISignalMessage[] = [];

    private readonly submitManager: BatchManager<IDocumentMessage[]>;

    private _details: IConnected | undefined;

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
    constructor(
            private readonly socket: SocketIOClient.Socket,
            public documentId: string) {
        super();

        this.submitManager = new BatchManager<IDocumentMessage[]>(
            (submitType, work) => {
                this.socket.emit(submitType, this.clientId, work);
            });

        // tslint:disable-next-line:no-non-null-assertion
        this.socket.on("op", this.earlyOpHandler!);
        // tslint:disable-next-line:no-non-null-assertion
        this.socket.on("op-content", this.earlyContentHandler!);
        // tslint:disable-next-line:no-non-null-assertion
        this.socket.on("signal", this.earlySignalHandler!);
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
    public get initialMessages(): ISequencedDocumentMessage[] | undefined {
        if (this.earlyOpHandler) {
            this.socket.removeListener("op", this.earlyOpHandler);
            this.earlyOpHandler = undefined;
        }

        assert(this.listeners("op").length !== 0, "No op handler is setup!");

        if (this.queuedMessages.length > 0) {
            // some messages were queued.
            // add them to the list of initialMessages to be processed
            if (!this.details.initialMessages) {
                this.details.initialMessages = [];
            }

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
    public get initialContents(): IContentMessage[] | undefined {
        if (this.earlyContentHandler) {
            this.socket.removeListener("op-content", this.earlyContentHandler);
            this.earlyContentHandler = undefined;
        }

        assert(this.listeners("op-content").length !== 0, "No op-content handler is setup!");

        if (this.queuedContents.length > 0) {
            // some contents were queued.
            // add them to the list of initialContents to be processed
            if (!this.details.initialContents) {
                this.details.initialContents = [];
            }

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
    public get initialSignals(): ISignalMessage[] | undefined {
        if (this.earlySignalHandler) {
            this.socket.removeListener("signal", this.earlySignalHandler);
            this.earlySignalHandler = undefined;
        }

        assert(this.listeners("signal").length !== 0, "No signal handler is setup!");

        if (this.queuedSignals.length > 0) {
            // some signals were queued.
            // add them to the list of initialSignals to be processed
            if (!this.details.initialSignals) {
                this.details.initialSignals = [];
            }

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
        return this.details.initialClients ? this.details.initialClients : [];
    }

    /**
     * Subscribe to events emitted by the document
     *
     * @param event - event emitted by the document to listen to
     * @param listener - listener for the event
     */
    public on(event: string, listener: (...args: any[]) => void): this {
        assert(this.listeners(event).length === 0, "re-registration of events is not implemented");

        // Register for the event on socket.io
        this.socket.on(
            event,
            (...args: any[]) => {
                this.emit(event, ...args);
            });

        // And then add the listener to our event emitter
        super.on(event, listener);

        return this;
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
     */
    public disconnect() {
        this.socket.disconnect();
    }

    private earlyOpHandler ? = (documentId: string, msgs: ISequencedDocumentMessage[]) => {
        debug("Queued early ops", msgs.length);
        this.queuedMessages.push(...msgs);
    }

    private earlyContentHandler ? = (msg: IContentMessage) => {
        debug("Queued early contents");
        this.queuedContents.push(msg);
    }

    private earlySignalHandler ? = (msg: ISignalMessage) => {
        debug("Queued early signals");
        this.queuedSignals.push(msg);
    }

    private async initialize(connectMessage: IConnect) {
        this._details = await new Promise<IConnected>((resolve, reject) => {
            // Listen for connection issues
            this.socket.on("connect_error", (error) => {
                debug(`Socket connection error: [${error}]`);
                reject(createErrorObject("connect_error", error));
            });

            // Listen for timeouts
            this.socket.on("connect_timeout", () => {
                reject(createErrorObject("connect_timeout", "Socket connection timed out"));
            });

            this.socket.on("connect_document_success", (response: IConnected) => {
                resolve(response);
            });

            this.socket.on("error", ((error) => {
                debug(`Error in documentDeltaConection: ${error}`);
                // This includes "Invalid namespace" error, which we consider critical (reconnecting will not help)
                this.socket.disconnect();
                reject(createErrorObject("error", error, error !== "Invalid namespace"));
            }));

            this.socket.on("connect_document_error", ((error) => {
                // This is not an error for the socket - it's a protocol error.
                // In this case we disconnect the socket and indicate that we were unable to create the
                // DocumentDeltaConnection.
                this.socket.disconnect();
                reject(createErrorObject("connect_document_error", error));
            }));

            this.socket.emit("connect_document", connectMessage);
        });
    }
}
