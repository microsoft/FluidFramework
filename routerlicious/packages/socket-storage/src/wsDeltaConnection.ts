import {
    IClient,
    IDocumentDeltaConnection,
    IDocumentMessage,
    ISequencedDocumentMessage,
    IUser,
} from "@prague/runtime-definitions";
import { BatchManager } from "@prague/utils";
import { EventEmitter } from "events";
import * as ws from "isomorphic-ws";
import { debug } from "./debug";
import * as messages from "./messages";

/**
 * Represents a connection to a stream of delta updates
 */
export class WSDeltaConnection extends EventEmitter implements IDocumentDeltaConnection {
    public static Create(
        tenantId: string,
        id: string,
        token: string,
        client: IClient,
        url: string): Promise<IDocumentDeltaConnection> {

        return new Promise<IDocumentDeltaConnection>((resolve, reject) => {
            const connection = new WSDeltaConnection(tenantId, id, token, client, url);

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

    private socket: ws;
    private submitManager: BatchManager<IDocumentMessage>;
    private details: messages.IConnected;

    public get clientId(): string {
        return this.details.clientId;
    }

    public get existing(): boolean {
        return this.details.existing;
    }

    public get parentBranch(): string {
        return this.details.parentBranch;
    }

    public get maxMessageSize(): number {
        return this.details.maxMessageSize;
    }

    public get user(): IUser {
        return this.details.user;
    }

    public get initialMessages(): ISequencedDocumentMessage[] {
        return this.details.initialMessages;
    }

    constructor(tenantId: string, public documentId: string, token: string, client: IClient, url: string) {
        super();

        const socket = new ws(
            `${url}?documentId${encodeURIComponent(documentId)}&tenantId${encodeURIComponent(tenantId)}`);

        socket.on("open", () => {
            const connectMessage: messages.IConnect = {
                client,
                id: documentId,
                tenantId,
                token,
            };
            this.socket.send(JSON.stringify(["connect", connectMessage]));
        });

        socket.on("message", (data) => {
            this.handleMessage(data);
        });

        socket.on("ping", (data) => {
            debug("ping", data.toString());
        });

        socket.on("pong", (data) => {
            debug("pong", data.toString());
        });

        socket.on("close", (code, reason) => {
            this.emit("disconnect", reason);
        });

        socket.on("error", (error) => {
            // TODO need to understand if an error will always result in a close
            debug(error);

            if (socket.readyState === ws.CONNECTING || socket.readyState === ws.OPEN) {
                socket.close(-1, error.toString());
            }
        });

        this.once("connect_document_success", (connectedMessage: messages.IConnected) => {
            this.details = connectedMessage;
        });

        this.submitManager = new BatchManager<IDocumentMessage>((submitType, work) => {
            this.socket.send(JSON.stringify([submitType, this.details.clientId, work]));
        });
    }

    /**
     * Submits a new delta operation to the server
     */
    public submit(message: IDocumentMessage): void {
        this.submitManager.add("submitOp", message);
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
