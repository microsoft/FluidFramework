/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventEmitter } from "events";
import { BatchManager, TypedEventEmitter } from "@fluidframework/common-utils";
import { IDocumentDeltaConnection, IDocumentDeltaConnectionEvents } from "@fluidframework/driver-definitions";
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
    NackErrorType,
} from "@fluidframework/protocol-definitions";
import * as core from "@fluidframework/server-services-core";
import { TestWebSocketServer } from "@fluidframework/server-test-utils";
import { debug } from "./debug";

const testProtocolVersions = ["^0.3.0", "^0.2.0", "^0.1.0"];
export class TestDocumentDeltaConnection
    extends TypedEventEmitter<IDocumentDeltaConnectionEvents>
    implements IDocumentDeltaConnection {
    public static async create(
        tenantId: string,
        id: string,
        token: string,
        client: IClient,
        webSocketServer: core.IWebSocketServer): Promise<TestDocumentDeltaConnection> {
        const socket = (webSocketServer as TestWebSocketServer).createConnection();

        const connectMessage: IConnect = {
            client,
            id,
            mode: client.mode,
            tenantId,
            token,  // Token is going to indicate tenant level information, etc...
            versions: testProtocolVersions,
        };

        const connection = await new Promise<IConnected>((resolve, reject) => {
            // Listen for ops sent before we receive a response to connect_document
            const queuedMessages: ISequencedDocumentMessage[] = [];
            const queuedContents: IContentMessage[] = [];
            const queuedSignals: ISignalMessage[] = [];

            const earlyOpHandler = (documentId: string, msgs: ISequencedDocumentMessage[]) => {
                debug("Queued early ops", msgs.length);
                queuedMessages.push(...msgs);
            };
            socket.on("op", earlyOpHandler);

            const earlyContentHandler = (msg: IContentMessage) => {
                debug("Queued early contents");
                queuedContents.push(msg);
            };
            socket.on("op-content", earlyContentHandler);

            const earlySignalHandler = (msg: ISignalMessage) => {
                debug("Queued early signals");
                queuedSignals.push(msg);
            };
            socket.on("signal", earlySignalHandler);

            // Listen for connection issues
            socket.on("connect_error", (error) => {
                reject(error);
            });

            socket.on("connect_document_success", (response: IConnected) => {
                socket.removeListener("op", earlyOpHandler);
                socket.removeListener("op-content", earlyContentHandler);
                socket.removeListener("signal", earlySignalHandler);

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

                if (queuedMessages.length > 0) {
                    // Some messages were queued.
                    // add them to the list of initialMessages to be processed
                    response.initialMessages.push(...queuedMessages);
                    response.initialMessages.sort((a, b) => a.sequenceNumber - b.sequenceNumber);
                }

                if (queuedContents.length > 0) {
                    // Some contents were queued.
                    // add them to the list of initialContents to be processed
                    response.initialContents.push(...queuedContents);

                    // eslint-disable-next-line max-len
                    response.initialContents.sort((a, b) => (a.clientId === b.clientId) ? 0 : ((a.clientId < b.clientId) ? -1 : 1) || a.clientSequenceNumber - b.clientSequenceNumber);
                }

                if (queuedSignals.length > 0) {
                    // Some signals were queued.
                    // add them to the list of initialSignals to be processed
                    response.initialSignals.push(...queuedSignals);
                }

                resolve(response);
            });

            socket.on("connect_document_error", reject);

            socket.emit("connect_document", connectMessage);
        });

        const deltaConnection = new TestDocumentDeltaConnection(socket, id, connection);

        return Promise.resolve(deltaConnection);
    }

    private readonly emitter = new EventEmitter();
    private readonly submitManager: BatchManager<IDocumentMessage[]>;

    public get clientId(): string {
        return this.details.clientId;
    }

    public get mode(): ConnectionMode {
        return this.details.mode;
    }

    public get claims(): ITokenClaims {
        return this.details.claims;
    }

    public get existing(): boolean {
        return this.details.existing;
    }

    public get parentBranch(): string | null {
        return this.details.parentBranch;
    }

    public get maxMessageSize(): number {
        return this.details.maxMessageSize;
    }

    public get initialMessages(): ISequencedDocumentMessage[] {
        return this.details.initialMessages;
    }

    public get initialContents(): IContentMessage[] {
        return this.details.initialContents;
    }

    public get initialSignals(): ISignalMessage[] {
        return this.details.initialSignals;
    }

    public get initialClients(): ISignalClient[] {
        return this.details.initialClients;
    }

    public get version(): string {
        return testProtocolVersions[0];
    }

    public get serviceConfiguration(): IServiceConfiguration {
        return this.details.serviceConfiguration;
    }

    constructor(
        private readonly socket: core.IWebSocket,
        public documentId: string,
        public details: IConnected) {
        super();

        this.submitManager = new BatchManager<IDocumentMessage[]>((submitType, work) => {
            this.socket.emit(
                submitType,
                this.details.clientId,
                work,
                (error) => {
                    if (error) {
                        debug("Emit error", error);
                    }
                });
        });

        this.on("newListener", (event, listener) => {
            this.socket.on(
                event,
                (...args: any[]) => {
                    this.emitter.emit(event, ...args);
                });
            this.emitter.on(event, listener);
        });
    }

    /**
     * Submits a new delta operation to the server
     */
    public submit(messages: IDocumentMessage[]): void {
        // We use a promise resolve to force a turn break given message processing is sync
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        Promise.resolve().then(() => {
            this.submitManager.add("submitOp", messages);
            this.submitManager.drain();
        });
    }

    /**
     * Submits a new signal to the server
     */
    public submitSignal(message: any): void {
        this.submitManager.add("submitSignal", message);
        this.submitManager.drain();
    }

    public async submitAsync(messages: IDocumentMessage[]): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            this.socket.emit(
                "submitContent",
                this.details.clientId,
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

    public disconnect() {
        // Do nothing
    }

    /**
     * Send a "disconnect" message on the socket.
     * @param disconnectReason - The reason of the disconnection.
     */
    public disconnectClient(disconnectReason: string) {
        this.socket.emit("disconnect", disconnectReason);
    }

    /**
     * * Sends a "nack" message on the socket.
     * @param code - An error code number that represents the error. It will be a valid HTTP error code.
     * @param type - Type of the Nack.
     * @param message - A message about the nack for debugging/logging/telemetry purposes.
     */
    public nackClient(code: number = 400, type: NackErrorType = NackErrorType.ThrottlingError, message: any) {
        const nackMessage = {
            operation: undefined,
            sequenceNumber: -1,
            content: {
                code,
                type,
                message,
            },
        };
        this.socket.emit("nack", "", [nackMessage]);
    }
}
