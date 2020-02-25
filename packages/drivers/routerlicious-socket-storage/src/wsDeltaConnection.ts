/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventEmitter } from "events";
import * as url from "url";
import { BatchManager } from "@microsoft/fluid-common-utils";
import { IDocumentDeltaConnection } from "@microsoft/fluid-driver-definitions";
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
import * as ws from "isomorphic-ws";

const protocolVersion = "^0.1.0";

/**
 * Represents a connection to a stream of delta updates for routerlicious driver.
 */
export class WSDeltaConnection extends EventEmitter implements IDocumentDeltaConnection {

    /**
     * Represents a connection to a stream of delta updates for routerlicious driver.
     *
     * @param tenantId - Id of the tenant.
     * @param id - Id of the document.
     * @param token - Token for authorization.
     * @param client - Client id of the client that connects to socket.
     * @param urlStr - url to connect to delta stream.
     * @returns Delta connection to the stream.
     */
    // eslint-disable-next-line @typescript-eslint/promise-function-async
    public static create(
        tenantId: string,
        id: string,
        token: string,
        client: IClient,
        urlStr: string,
        mode: ConnectionMode): Promise<IDocumentDeltaConnection> {

        return new Promise<IDocumentDeltaConnection>((resolve, reject) => {
            const connection = new WSDeltaConnection(tenantId, id, token, client, urlStr, mode);

            const resolveHandler = () => {
                resolve(connection);
                // eslint-disable-next-line @typescript-eslint/no-use-before-define
                connection.removeListener("disconnected", rejectHandler);
            };

            const rejectHandler = (error) => {
                reject(error);
                connection.removeListener("connect_document_success", resolveHandler);
            };

            connection.once("disconnected", rejectHandler);
            connection.once("connect_document_success", resolveHandler);
        });
    }

    private readonly socket: ws;
    private readonly submitManager: BatchManager<IDocumentMessage[]>;
    private details: IConnected | undefined;

    public get clientId(): string {
        return this.details!.clientId;
    }

    public get mode(): ConnectionMode {
        return this.details!.mode;
    }

    public get claims(): ITokenClaims {
        return this.details!.claims;
    }

    public get existing(): boolean {
        return this.details!.existing;
    }

    public get parentBranch(): string | null {
        return this.details!.parentBranch;
    }

    public get maxMessageSize(): number {
        return this.details!.maxMessageSize;
    }

    public get version(): string {
        return this.details!.version;
    }

    public get initialMessages(): ISequencedDocumentMessage[] | undefined {
        return this.details!.initialMessages;
    }

    public get initialContents(): IContentMessage[] | undefined {
        return this.details!.initialContents;
    }

    public get initialSignals(): ISignalMessage[] | undefined {
        return this.details!.initialSignals;
    }

    public get initialClients(): ISignalClient[] {
        return this.details!.initialClients ? this.details!.initialClients : [];
    }

    public get serviceConfiguration(): IServiceConfiguration {
        return this.details!.serviceConfiguration;
    }

    constructor(
        tenantId: string,
        public documentId: string,
        token: string,
        client: IClient,
        urlStr: string,
        mode: ConnectionMode) {
        super();

        const p = url.parse(urlStr);
        const protocol = p.protocol === "https:" ? "wss" : "ws";
        const wsUrl = `${protocol}://${p.host}${p.pathname}`;

        this.socket = new ws(
            `${wsUrl}?documentId${encodeURIComponent(documentId)}&tenantId${encodeURIComponent(tenantId)}`);

        this.socket.onopen = () => {
            const connectMessage: IConnect = {
                client,
                id: documentId,
                mode,
                tenantId,
                token,
                versions: [protocolVersion],
            };
            this.sendMessage(JSON.stringify(["connect", connectMessage]));
        };

        this.socket.onmessage = (ev) => {
            this.handleMessage(ev.data);
        };

        this.socket.onclose = (ev) => {
            this.emit("disconnect", ev.reason);
        };

        this.socket.onerror = (error) => {
            // TODO need to understand if an error will always result in a close
            this.emit("error", error);

            if (this.socket.readyState === ws.CONNECTING || this.socket.readyState === ws.OPEN) {
                this.socket.close(-1, error.toString());
            }
        };

        this.once("connect_document_success", (connectedMessage: IConnected) => {
            this.details = connectedMessage;
        });

        this.submitManager = new BatchManager<IDocumentMessage[]>((submitType, work) => {
            this.sendMessage(JSON.stringify([submitType, this.details!.clientId, work]));
        });
    }

    /**
     * Submits a new delta operation to the server
     */
    public submit(messages: IDocumentMessage[]): void {
        this.submitManager.add("submitOp", messages);
    }

    /**
     * Submits a new signal to the server
     */
    public submitSignal(message: any): void {
        this.submitManager.add("submitSignal", message);
    }

    public async submitAsync(messages: IDocumentMessage[]): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            this.socket.send(JSON.stringify(["submitContent", this.details!.clientId, messages]), (error) => {
                if (error) {
                    this.emit("error", error);
                    reject(error);
                } else {
                    resolve();
                }
            });
        });
    }

    public disconnect() {
        this.socket.close();
    }

    private handleMessage(data: ws.Data) {
        const args = JSON.parse(data as string) as any[];
        this.emit(args[0], ...args.slice(1));
    }

    private sendMessage(message: string) {
        // NOTE: We use which is isomorphic-ws, and it maps either to WebSocket (in browser) or ws (in Node.js)
        // Later has callback (2nd argument to send), but the former does not!
        // If you are enabling WebSockets (this code path is not used right now), and this causes trouble,
        // please refactor code appropriately to make it work, and not lose error notifications in either case!
        this.socket.send(
            message,
            (error) => {
                if (error) {
                    this.emit("error", error);
                }
            },
        );
    }
}
