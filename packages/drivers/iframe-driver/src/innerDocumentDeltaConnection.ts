/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventEmitter } from "events";
import { IDisposable } from "@fluidframework/common-definitions";
import { Deferred, TypedEventEmitter } from "@fluidframework/common-utils";
import { IDocumentDeltaConnection, IDocumentDeltaConnectionEvents } from "@fluidframework/driver-definitions";
import {
    ConnectionMode,
    IClientConfiguration,
    IConnected,
    IDocumentMessage,
    ISequencedDocumentMessage,
    ISignalClient,
    ISignalMessage,
    ITokenClaims,
} from "@fluidframework/protocol-definitions";
import * as Comlink from "comlink";

/**
 * @deprecated The iframe-driver is deprecated and should not be used, it will be removed in an upcoming release
 */
export interface IOuterDocumentDeltaConnectionProxy {
    /**
     * @deprecated The iframe-driver is deprecated and should not be used, it will be removed in an upcoming release
     */
    handshake: Deferred<any>;
    /**
     * @deprecated The iframe-driver is deprecated and should not be used, it will be removed in an upcoming release
     */
    getDetails(): Promise<IConnected>;
    /**
     * @deprecated The iframe-driver is deprecated and should not be used, it will be removed in an upcoming release
     */
    submit(messages: IDocumentMessage[]): Promise<void>;
    /**
     * @deprecated The iframe-driver is deprecated and should not be used, it will be removed in an upcoming release
     */
    submitSignal(message: IDocumentMessage): Promise<void>;
}

/**
 * Represents a connection to a stream of delta updates
 * @deprecated The iframe-driver is deprecated and should not be used, it will be removed in an upcoming release
 */
export class InnerDocumentDeltaConnection
    extends TypedEventEmitter<IDocumentDeltaConnectionEvents>
    implements IDocumentDeltaConnection, IDisposable {
    /**
     * Create a DocumentDeltaConnection
     * @deprecated The iframe-driver is deprecated and should not be used, it will be removed in an upcoming release
     *
     * @param id - document ID
     */
    public static async create(
        connection: IConnected,
        outerProxy: IOuterDocumentDeltaConnectionProxy): Promise<IDocumentDeltaConnection> {
        const tempEmitter = new EventEmitter();

        const forwardEvent = (event: string, args: any[]) => {
            tempEmitter.emit(event, ...args);
            return;
        };

        const innerProxy = {
            forwardEvent,
        };

        outerProxy.handshake.resolve((Comlink.proxy(innerProxy)));

        const deltaConnection = new InnerDocumentDeltaConnection(connection, outerProxy, tempEmitter);

        return deltaConnection;
    }

    /**
     * Get the ID of the client who is sending the message
     * @deprecated The iframe-driver is deprecated and should not be used, it will be removed in an upcoming release
     *
     * @returns the client ID
     */
    public get clientId(): string {
        return this.details.clientId;
    }

    /**
     * Get the mode of the client
     * @deprecated The iframe-driver is deprecated and should not be used, it will be removed in an upcoming release
     *
     * @returns the client mode
     */
    public get mode(): ConnectionMode {
        return this.details.mode;
    }

    /**
     * Get the claims of the client who is sending the message
     * @deprecated The iframe-driver is deprecated and should not be used, it will be removed in an upcoming release
     *
     * @returns client claims
     */
    public get claims(): ITokenClaims {
        return this.details.claims;
    }

    /**
     * Get whether or not this is an existing document
     * @deprecated The iframe-driver is deprecated and should not be used, it will be removed in an upcoming release
     *
     * @returns true if the document exists
     */
    public get existing(): boolean {
        return this.details.existing;
    }

    /**
     * Get the maximum size of a message before chunking is required
     * @deprecated The iframe-driver is deprecated and should not be used, it will be removed in an upcoming release
     *
     * @returns the maximum size of a message before chunking is required
     */
    public get maxMessageSize(): number {
        return this.details.serviceConfiguration.maxMessageSize;
    }

    /**
     * Semver of protocol being used with the service
     * @deprecated The iframe-driver is deprecated and should not be used, it will be removed in an upcoming release
     */
    public get version(): string {
        return this.details.version;
    }

    /**
     * Configuration details provided by the service
     * @deprecated The iframe-driver is deprecated and should not be used, it will be removed in an upcoming release
     */
    public get serviceConfiguration(): IClientConfiguration {
        return this.details.serviceConfiguration;
    }

    /**
     * Get messages sent during the connection
     * @deprecated The iframe-driver is deprecated and should not be used, it will be removed in an upcoming release
     *
     * @returns messages sent during the connection
     */
    public get initialMessages(): ISequencedDocumentMessage[] {
        return this.details.initialMessages;
    }

    /**
     * Get signals sent during the connection
     * @deprecated The iframe-driver is deprecated and should not be used, it will be removed in an upcoming release
     *
     * @returns signals sent during the connection
     */
    public get initialSignals(): ISignalMessage[] {
        return this.details.initialSignals;
    }

    /**
     * Get initial client list
     * @deprecated The iframe-driver is deprecated and should not be used, it will be removed in an upcoming release
     *
     * @returns initial client list sent during the connection
     */
    public get initialClients(): ISignalClient[] {
        return this.details.initialClients;
    }

    /**
     * @deprecated The iframe-driver is deprecated and should not be used, it will be removed in an upcoming release
     */
    public get lastKnownOpNumber() {
        // TODO: remove once latest server bits are picked up
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return
        return (this.details as any).lastKnownOpNumber;
    }

    /**
     * @param socket - websocket to be used
     * @param documentId - ID of the document
     * @param details - details of the websocket connection
     * @deprecated The iframe-driver is deprecated and should not be used, it will be removed in an upcoming release
     */
    private constructor(
        /**
         * @deprecated The iframe-driver is deprecated and should not be used, it will be removed in an upcoming
         * release
         */
        public details: IConnected,
        /**
         * @deprecated The iframe-driver is deprecated and should not be used, it will be removed in an upcoming
         * release
         */
        public outerProxy: IOuterDocumentDeltaConnectionProxy,
        tempEmitter: EventEmitter) {
        super();

        this.on("newListener", (event, listener) => {
            tempEmitter.on(
                event,
                (...args: any[]) => {
                    this.emit(event, ...args);
                    listener(...args);
                });
        });
    }

    /**
     * Submits a new delta operation to the server
     * @deprecated The iframe-driver is deprecated and should not be used, it will be removed in an upcoming release
     *
     * @param message - delta operation to submit
     */
    public submit(messages: IDocumentMessage[]): void {
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        this.outerProxy.submit(messages);
    }

    /**
     * Submits a new signal to the server
     * @deprecated The iframe-driver is deprecated and should not be used, it will be removed in an upcoming release
     *
     * @param message - signal to submit
     */
    public submitSignal(message: IDocumentMessage): void {
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        this.outerProxy.submitSignal(message);
    }

    /**
     * @deprecated The iframe-driver is deprecated and should not be used, it will be removed in an upcoming release
     */
    public get disposed() { return false; }
    /**
     * @deprecated The iframe-driver is deprecated and should not be used, it will be removed in an upcoming release
     */
    public dispose() {
        throw new Error("InnerDocumentDeltaConnection: close() not implemented Yet");
    }
}
