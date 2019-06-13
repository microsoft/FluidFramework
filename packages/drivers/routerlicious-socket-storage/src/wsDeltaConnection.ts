import {
    IClient,
    IContentMessage,
    IDocumentDeltaConnection,
    IDocumentMessage,
    ISequencedDocumentMessage,
    ISignalMessage,
} from "@prague/container-definitions";
import { IConnect, IConnected } from "@prague/socket-storage-shared";
import { BatchManager } from "@prague/utils";
import { EventEmitter } from "events";
import * as ws from "isomorphic-ws";
import * as url from "url";

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
    public static Create(
        tenantId: string,
        id: string,
        token: string,
        client: IClient,
        urlStr: string): Promise<IDocumentDeltaConnection> {

        return new Promise<IDocumentDeltaConnection>((resolve, reject) => {
            const connection = new WSDeltaConnection(tenantId, id, token, client, urlStr);

            const resolveHandler = () => {
                resolve(connection);
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
    private readonly submitManager: BatchManager<IDocumentMessage>;
    private details: IConnected | undefined;

    public get clientId(): string {
        return this.details!.clientId;
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

    public get initialMessages(): ISequencedDocumentMessage[] | undefined {
        return this.details!.initialMessages;
    }

    public get initialContents(): IContentMessage[] | undefined {
        return this.details!.initialContents;
    }

    public get initialSignals(): ISignalMessage[] | undefined {
        return this.details!.initialSignals;
    }

    constructor(tenantId: string, public documentId: string, token: string, client: IClient, urlStr: string) {
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
                tenantId,
                token,
                versions: [protocolVersion],
            };
            this.socket.send(
                JSON.stringify(["connect", connectMessage]),
                (error) => {
                    if (error) {
                        this.emit("error", error);
                    }
                },
            );
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

        this.submitManager = new BatchManager<IDocumentMessage>((submitType, work) => {
            this.socket.send(
                JSON.stringify([submitType, this.details!.clientId, work]),
                (error) => {
                    if (error) {
                        this.emit("error", error);
                    }
                },
            );
        });
    }

    /**
     * Submits a new delta operation to the server
     */
    public submit(message: IDocumentMessage): void {
        this.submitManager.add("submitOp", message);
    }

    /**
     * Submits a new signal to the server
     */
    // tslint:disable no-unsafe-any
    public submitSignal(message: any): void {
        this.submitManager.add("submitSignal", message);
    }

    public async submitAsync(message: IDocumentMessage): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            this.socket.send(JSON.stringify(["submitContent", this.details!.clientId, message]), (error) => {
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
        // tslint:disable-next-line:no-unsafe-any
        this.emit(args[0], ...args.slice(1));
    }
}
