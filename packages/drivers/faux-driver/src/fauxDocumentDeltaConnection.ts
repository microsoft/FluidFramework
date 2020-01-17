/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as assert from "assert";
import { EventEmitter } from "events";
import { BatchManager } from "@microsoft/fluid-core-utils";
import { IDocumentDeltaConnection } from "@microsoft/fluid-driver-definitions";
import {
    ConnectionMode,
    IClient,
    IConnected,
    IContentMessage,
    IDocumentMessage,
    ISequencedDocumentMessage,
    IServiceConfiguration,
    ISignalClient,
    ISignalMessage,
    ITokenClaims,
    ScopeType,
    IClientJoin,
    ISequencedDocumentSystemMessage,
} from "@microsoft/fluid-protocol-definitions";

const protocolVersions = ["^0.3.0", "^0.2.0", "^0.1.0"];

/**
 * Represents a connection to a stream of delta updates. This also provides functionality to stamp ops and then emit them.
 */
export class FauxDocumentDeltaConnection extends EventEmitter implements IDocumentDeltaConnection {

    private sequenceNumber: number = 1;

    /**
     * Create a DocumentDeltaConnection
     *
     * @param client - information about the client
     * @param mode - connection mode
     */
    public static async create(
        client: IClient,
        mode: ConnectionMode): Promise<IDocumentDeltaConnection> {

        const deltaConnection = new FauxDocumentDeltaConnection();

        deltaConnection.initialize(client, mode);
        return deltaConnection;
    }

    // These are the queues for messages, signals, contents that will be pushed to server when
    // an actual connection is created.
    private readonly queuedMessages: ISequencedDocumentMessage[] = [];
    private readonly queuedContents: IContentMessage[] = [];
    private readonly queuedSignals: ISignalMessage[] = [];

    private readonly opSubmitManager: BatchManager<IDocumentMessage[]>;
    private readonly signalSubmitManager: BatchManager<IDocumentMessage[]>;
    private readonly contentSubmitManager: BatchManager<IDocumentMessage[]>;

    private _details: IConnected | undefined;

    private get details(): IConnected {
        if (!this._details) {
            throw new Error("Internal error: calling method before _details is initialized!");
        }
        return this._details;
    }

    protected constructor() {
        super();

        this.opSubmitManager = new BatchManager<IDocumentMessage[]>(
            (submitType, work) => {
                for (const singleWork of work) {
                    for (const message of singleWork) {
                        const stampedMessage = this.stampMessage(message);
                        this.queuedMessages.push(stampedMessage);
                        this.emit("op", this.details.claims.documentId, stampedMessage);
                    }
                }
            });

        this.signalSubmitManager = new BatchManager<IDocumentMessage[]>(
            (submitType, work) => {
                for (const singleWork of work) {
                    for (const signal of singleWork) {
                        const signalMessage: ISignalMessage = {
                            clientId: this.clientId,
                            content: signal,
                        };
                        this.queuedSignals.push(signalMessage);
                        this.emit("signal", signalMessage);
                    }
                }
            });

        this.contentSubmitManager = new BatchManager<IDocumentMessage[]>(
            (submitType, work) => {
                for (const singleWork of work) {
                    for (const message of singleWork) {
                        const contentMessage: IContentMessage = {
                            clientId: this.clientId,
                            clientSequenceNumber: message.clientSequenceNumber,
                            contents: message.contents,
                        };
                        this.queuedContents.push(contentMessage);
                        this.emit("op-content", contentMessage);
                    }
                }
            });
    }

    /**
     * Stamps the messages like a server.
     * @param message - Message to be stamped.
     */
    private stampMessage(message: IDocumentMessage): ISequencedDocumentMessage {
        const stampedMessage: ISequencedDocumentMessage = {
            clientId: this.clientId,
            clientSequenceNumber: message.clientSequenceNumber,
            contents: message.contents,
            minimumSequenceNumber: message.referenceSequenceNumber,
            referenceSequenceNumber: message.referenceSequenceNumber,
            sequenceNumber: this.sequenceNumber++,
            timestamp: Date.now(),
            traces: message.traces || [],
            type: message.type,
            metadata: message.metadata,
            origin: undefined,
        };
        return stampedMessage;
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
        return this.details.initialMessages ? this.details.initialMessages : [];
    }

    /**
     * Get contents sent during the connection
     *
     * @returns contents sent during the connection
     */
    public get initialContents(): IContentMessage[] | undefined {
        return this.details.initialContents ? this.details.initialContents : [];
    }

    /**
     * Get signals sent during the connection
     *
     * @returns signals sent during the connection
     */
    public get initialSignals(): ISignalMessage[] | undefined {
        return this.details.initialSignals ? this.details.initialSignals : [];
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

        super.on(event, listener);

        return this;
    }

    /**
     * Submits a new delta operation to the server
     *
     * @param message - delta operation to submit
     */
    public submit(messages: IDocumentMessage[]): void {
        this.opSubmitManager.add("submitOp", messages);
    }

    /**
     * Submits a new message to the server without queueing
     *
     * @param message - message to submit
     */
    public async submitAsync(messages: IDocumentMessage[]): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            this.contentSubmitManager.add("submitContent", messages);
            resolve();
        });
    }

    /**
     * Submits a new signal to the server
     *
     * @param message - signal to submit
     */
    public submitSignal(message: IDocumentMessage): void {
        this.signalSubmitManager.add("submitSignal", [message]);
    }

    /**
     * Disconnect from the websocket
     * @param socketProtocolError - true if error happened on socket / socket.io protocol level
     *  (not on Fluid protocol level)
     */
    public disconnect(socketProtocolError: boolean = false) {
    }

    /**
     * Initialize the details for the connction and send the join op.
     * @param client - Client who initiated the connection.
     * @param mode - Mode of the connection.
     */
    private initialize(client: IClient, mode: ConnectionMode) {
        const claims: ITokenClaims = {
            documentId: "fauxdocid",
            scopes: client.scopes,
            tenantId: "fauxtenantid",
            user: { id: "fauxuserid" },
        };
        const DefaultServiceConfiguration: IServiceConfiguration = {
            blockSize: 64436,
            maxMessageSize: 16 * 1024,
            summary: {
                idleTime: 5000,
                maxOps: 1000,
                maxTime: 5000 * 12,
                maxAckWaitTime: 600000,
            },
        };
        const clientId: string = "random-random";
        const clientDetail: IClientJoin = {
            clientId,
            detail: client,
        };
        const joinMessage = this.createClientJoinMessage(clientDetail);
        this.queuedMessages.push(joinMessage);
        if (this.isWriter(client.scopes, false, mode)) {
            this._details = {
                claims,
                clientId,
                existing: false,
                maxMessageSize: 16 * 1024,
                mode: "write",
                parentBranch: null,
                serviceConfiguration: DefaultServiceConfiguration,
                initialClients: [{ clientId, client }],
                initialMessages: [joinMessage],
                supportedVersions: protocolVersions,
                version: "fauxVersion",
            };
        } else {
            this._details = {
                claims,
                clientId,
                existing: false,
                maxMessageSize: 1024, // Readonly client can't send ops.
                mode: "read",
                parentBranch: null, // Does not matter for now.
                serviceConfiguration: DefaultServiceConfiguration,
                initialClients: [{ clientId, client }],
                initialMessages: [joinMessage],
                supportedVersions: protocolVersions,
                version: "fauxVersion",
            };
        }
    }

    private createClientJoinMessage(clientDetail: IClientJoin): ISequencedDocumentMessage {
        const joinMessage: ISequencedDocumentSystemMessage = {
            clientId: clientDetail.clientId,
            clientSequenceNumber: -1,
            contents: null,
            minimumSequenceNumber: 0,
            referenceSequenceNumber: -1,
            sequenceNumber: this.sequenceNumber++,
            timestamp: Date.now(),
            traces: [],
            data: JSON.stringify(clientDetail),
            type: "join",
        };
        return joinMessage;
    }

    private isWriter(scopes: string[], existing: boolean, mode: ConnectionMode): boolean {
        if (this.canWrite(scopes) || this.canSummarize(scopes)) {
            // New document needs a writer to boot.
            if (!existing) {
                return true;
            } else {
                // Back-compat for old client and new server.
                if (mode === undefined) {
                    return true;
                } else {
                    return mode === "write";
                }
            }
        } else {
            return false;
        }
    }

    private calculateScope(scopes: string[]) {
        if (scopes === undefined || scopes.length === 0) {
            return undefined;
        }
        const read = scopes.includes(ScopeType.DocRead);
        const write = scopes.includes(ScopeType.DocWrite);
        const summarize = scopes.includes(ScopeType.SummaryWrite);
        return {
            read,
            summarize,
            write,
        };
    }

    private canWrite(scopes: string[]): boolean {
        const clientScope = this.calculateScope(scopes);
        return clientScope === undefined ? true : clientScope.write;
    }

    private canSummarize(scopes: string[]): boolean {
        const clientScope = this.calculateScope(scopes);
        return clientScope === undefined ? true : clientScope.summarize;
    }
}
