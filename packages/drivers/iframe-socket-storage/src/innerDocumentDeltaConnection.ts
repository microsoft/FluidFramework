/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventEmitter } from "events";
import { Deferred } from "@microsoft/fluid-common-utils";
import { IDocumentDeltaConnection } from "@microsoft/fluid-driver-definitions";
import {
    ConnectionMode,
    IConnected,
    IContentMessage,
    IDocumentMessage,
    ISequencedDocumentMessage,
    IServiceConfiguration,
    ISignalClient,
    ISignalMessage,
    ITokenClaims,
} from "@microsoft/fluid-protocol-definitions";
import * as Comlink from "comlink";

export interface IOuterDocumentDeltaConnectionProxy {
    handshake: Deferred<any>;
    getDetails(): Promise<IConnected>;
    submit(messages: IDocumentMessage[]): Promise<void>;
    submitSignal(message: IDocumentMessage): Promise<void>;
}

/**
 * Represents a connection to a stream of delta updates
 */
export class InnerDocumentDeltaConnection extends EventEmitter implements IDocumentDeltaConnection {
    /**
     * Create a DocumentDeltaConnection
     *
     * @param id - document ID
     */
    public static async create(
        connection: IConnected,
        outerProxy: Comlink.Remote<IOuterDocumentDeltaConnectionProxy>): Promise<IDocumentDeltaConnection> {

        const tempEmitter = new EventEmitter();

        const forwardEvent = (event: string, args: any[]) =>{
            tempEmitter.emit(event, ... args);
            return;
        };

        const innerProxy = {
            forwardEvent,
        };

        await outerProxy.handshake.resolve((Comlink.proxy(innerProxy)));

        const deltaConnection = new InnerDocumentDeltaConnection(connection, outerProxy, tempEmitter);

        return deltaConnection;
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
     * @param socket - websocket to be used
     * @param documentId - ID of the document
     * @param details - details of the websocket connection
     */
    private constructor(
        public details: IConnected,
        public outerProxy: Comlink.Remote<IOuterDocumentDeltaConnectionProxy>,
        private readonly tempEmitter: EventEmitter) {
        super();
    }

    /**
     * Subscribe to events emitted by the document
     *
     * @param event - event emitted by the document to listen to
     * @param listener - listener for the event
     */
    public on(event: string, listener: (...args: any[]) => void): this {

        this.tempEmitter.on(
            event,
            (...args: any[]) => {
                this.emit(event, ...args);
                listener(...args);
            });
        super.on(event, listener);

        return this;
    }

    /**
     * Submits a new delta operation to the server
     *
     * @param message - delta operation to submit
     */
    public submit(messages: IDocumentMessage[]): void {
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        this.outerProxy.submit(messages);
    }

    /**
     * Submits a new message to the server without queueing
     *
     * @param message - message to submit
     */
    public async submitAsync(messages: IDocumentMessage[]): Promise<void> {
        return this.outerProxy.submit(messages);
    }

    /**
     * Submits a new signal to the server
     *
     * @param message - signal to submit
     */
    public submitSignal(message: IDocumentMessage): void {
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        this.outerProxy.submitSignal(message);
    }

    /**
     * Disconnect from the websocket
     */
    public disconnect() {
        throw new Error("InnerDocumentDeltaConnection: Disconnect not implemented Yet");
    }
}
