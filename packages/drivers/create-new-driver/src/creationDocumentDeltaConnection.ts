/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventEmitter } from "events";
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
    IConnect,
} from "@microsoft/fluid-protocol-definitions";
import { CreationServerMessagesHandler } from "./creationDriverServer";

const protocolVersions = ["^0.4.0", "^0.3.0", "^0.2.0", "^0.1.0"];

/**
 * Represents a connection to a stream of delta updates. This also provides functionality to stamp
 * ops and then emit them.
 */
export class CreationDocumentDeltaConnection extends EventEmitter implements IDocumentDeltaConnection {

    private _details: IConnected | undefined;

    private get details(): IConnected {
        if (this._details === undefined) {
            throw new Error("Internal error: calling method before _details is initialized!");
        }
        return this._details;
    }

    constructor(
        client: IClient,
        private readonly documentId: string,
        private readonly tenantId: string,
        private readonly serverMessagesHandler: CreationServerMessagesHandler) {
        super();

        this.initialize(client);
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

    /* Issue #1566: Backward compat - cleanup initialMessages, etc. being undefined*/

    /**
     * Get messages sent during the connection
     *
     * @returns messages sent during the connection
     */
    public get initialMessages(): ISequencedDocumentMessage[] {
        return this.details.initialMessages ?? [];
    }

    /**
     * Get contents sent during the connection
     *
     * @returns contents sent during the connection
     */
    public get initialContents(): IContentMessage[] {
        return this.details.initialContents ?? [];
    }

    /**
     * Get signals sent during the connection
     *
     * @returns signals sent during the connection
     */
    public get initialSignals(): ISignalMessage[] {
        return this.details.initialSignals ?? [];
    }

    /**
     * Get initial client list
     *
     * @returns initial client list sent during the connection
     */
    public get initialClients(): ISignalClient[] {
        return this.details.initialClients ?? [];
    }

    /**
     * Submits a new delta operation to the server
     *
     * @param message - delta operation to submit
     */
    public submit(messages: IDocumentMessage[]): void {
        this.serverMessagesHandler.submitMessage(messages, this.clientId);
    }

    /**
     * Submits a new message to the server without queueing
     *
     * @param message - message to submit
     */
    public async submitAsync(messages: IDocumentMessage[]): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            this.serverMessagesHandler.submitMessage(messages, this.clientId);
            resolve();
        });
    }

    /**
     * Submits a new signal to the server
     *
     * @param message - signal to submit
     */
    public submitSignal(message: IDocumentMessage): void {
        this.serverMessagesHandler.submitSignal(message, this.clientId);
    }

    /**
     * Disconnect from the websocket
     * @param socketProtocolError - true if error happened on socket / socket.io protocol level
     *  (not on Fluid protocol level)
     */
    public disconnect(socketProtocolError: boolean = false) {
        throw new Error("Not implemented.");
    }

    /**
     * Initialize the details for the connction and send the join op.
     * @param client - Client who initiated the connection.
     * @param mode - Mode of the connection.
     */
    private initialize(client: IClient) {
        const connectMessage: IConnect = {
            client,
            id: this.documentId,
            mode: client.mode,
            tenantId: this.tenantId,
            token: "token",
            versions: protocolVersions,
        };
        this._details = this.serverMessagesHandler.createClient(connectMessage, this);
    }
}
