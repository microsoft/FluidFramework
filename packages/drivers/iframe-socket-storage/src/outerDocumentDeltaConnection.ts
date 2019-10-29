/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IConnected } from "@microsoft/fluid-driver-base";
import {
    ConnectionMode,
    IContentMessage,
    IDocumentDeltaConnection,
    IDocumentMessage,
    ISequencedDocumentMessage,
    IServiceConfiguration,
    ISignalClient,
    ISignalMessage,
    ITokenClaims,
} from "@microsoft/fluid-protocol-definitions";
import { EventEmitter } from "events";

// tslint:disable: no-non-null-assertion no-console

export interface IInnerDocumentDeltaConnectionProxy {
    multi(a: number, b: number): Promise<number>;
    forwardEvent(event: string, args: any[]): Promise<void>;
}

export interface IOuterDocumentDeltaConnection {
    add(a: number, b: number): Promise<number>;
    getDetails(callback: (connection: IConnected) => void): Promise<void>;
    submit(messages: IDocumentMessage[]): Promise<void>;
    submitSignal(message: IDocumentMessage): Promise<void>;
}

/**
 * Represents a connection to a stream of delta updates
 */
export class OuterDocumentDeltaConnection extends EventEmitter implements IDocumentDeltaConnection {
    /**
     * Create a DocumentDeltaConnection
     *
     * @param id - document ID
     */
    public static create(
        documentDeltaConnection: IDocumentDeltaConnection,
        connection: IConnected,
        proxiedFunctionsFromInnerFrameP: Promise<IInnerDocumentDeltaConnectionProxy>,
    ): IDocumentDeltaConnection {

        const deltaConnection = new OuterDocumentDeltaConnection(
            connection,
            documentDeltaConnection,
            proxiedFunctionsFromInnerFrameP,
        );

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

    /**
     * Get messages sent during the connection
     *
     * @returns messages sent during the connection
     */
    public get initialMessages(): ISequencedDocumentMessage[] | undefined {
        return this.details.initialMessages;
    }

    /**
     * Get contents sent during the connection
     *
     * @returns contents sent during the connection
     */
    public get initialContents(): IContentMessage[] | undefined {
        return this.details.initialContents;
    }

    /**
     * Get signals sent during the connection
     *
     * @returns signals sent during the connection
     */
    public get initialSignals(): ISignalMessage[] | undefined {
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
     * @param socket - websocket to be used
     * @param documentId - ID of the document
     * @param details - details of the websocket connection
     */
    constructor(
        public details: IConnected,
        private readonly connection: IDocumentDeltaConnection,
        private readonly proxiedFunctionsFromInnerFrameP: Promise<IInnerDocumentDeltaConnectionProxy>,
        ) {
        super();

        // This cannot be an await, must be a then
        // Or else it causes a deadlock
        this.proxiedFunctionsFromInnerFrameP
            .then(async (innerProxy) => {
                const multiResult = await innerProxy.multi(2, 3);
                console.log(`Outer: 2 * 3 = ${multiResult}`);
            })
            .catch((err) => {
                console.error(err);
            });

        this.proxiedFunctionsFromInnerFrameP
            .then((innerProxy) => {
                this.connection.on("op", async (...args: any[]) => {
                    await innerProxy.forwardEvent("op", args);
                });

                this.connection.on("op-content", async (...args: any[]) => {
                    await innerProxy.forwardEvent("op-content", args);
                });

                this.connection.on("signal", async (...args: any[]) => {
                    await innerProxy.forwardEvent("signal", args);
                });

                this.connection.on("connect_error", async (...args: any[]) => {
                    await innerProxy.forwardEvent("connect_error", args);
                });

                this.connection.on("connect_timeout", async (...args: any[]) => {
                    await innerProxy.forwardEvent("connect_timeout", args);
                });

                this.connection.on("connect_document_success", async (...args: any[]) => {
                    await innerProxy.forwardEvent("connect_document_success", args);
                });

                this.connection.on("connect_document_success", async (...args: any[]) => {
                    await innerProxy.forwardEvent("connect_document_success", args);
                });

            })
            .catch((err) => {
                console.error(err);
            });
    }

    public getOuterDocumentDeltaConnection(): IOuterDocumentDeltaConnection {

        // Test
        async function add(a: number, b: number): Promise<number> {
            return a + b;
        }

        const getDetails = async () => this.details;

        const submit = async (messages: IDocumentMessage[]) => {
            this.connection.submit(messages);
        };

        const submitSignal = async (message: IDocumentMessage) => {
            this.connection.submitSignal(message);
        };

        const outerMethodsToProxy: IOuterDocumentDeltaConnection = {
            add,
            getDetails,
            submit,
            submitSignal,
        };

        return outerMethodsToProxy;
    }

    /**
     * Subscribe to events emitted by the document
     *
     * @param event - event emitted by the document to listen to
     * @param listener - listener for the event
     */
    public on(event: string, listener: (...args: any[]) => void): this {
        throw new Error("OuterDocumentDeltaConnection: Should have no listeners");
    }

    /**
     * Submits a new delta operation to the server
     *
     * @param message - delta operation to submit
     */
    public submit(messages: IDocumentMessage[]): void {
        return this.connection.submit(messages);
    }

    /**
     * Submits a new message to the server without queueing
     *
     * @param message - message to submit
     */
    public async submitAsync(messages: IDocumentMessage[]): Promise<void> {
        return this.connection.submitAsync(messages);
    }

    /**
     * Submits a new signal to the server
     *
     * @param message - signal to submit
     */
    public submitSignal(message: IDocumentMessage): void {
        this.connection.submitSignal(message);
    }

    /**
     * Disconnect from the websocket
     */
    public disconnect() {
        this.connection.disconnect();
    }
}
