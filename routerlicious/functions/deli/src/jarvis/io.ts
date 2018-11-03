import * as core from "@prague/routerlicious/dist/core";
import { ITokenClaims } from "@prague/runtime-definitions";
import * as socketStorage from "@prague/socket-storage";
import * as http from "http";
import * as jwt from "jsonwebtoken";
import * as moniker from "moniker";
import * as winston from "winston";
import * as ws from "ws";
import { KafkaOrdererConnection, KafkaOrdererFactory } from "./kafkaOrderer";

// TODO add validation to input message processing
// A safety mechanism to make sure that all outbound messages from alfred adheres to the permitted schema.
// function sanitizeMessage(message: any): IDocumentMessage {
//     return {
//         clientSequenceNumber: message.clientSequenceNumber,
//         contents: message.contents,
//         referenceSequenceNumber: message.referenceSequenceNumber,
//         traces: message.traces,
//         type: message.type,
//     };
// }

class WebSocket implements core.IWebSocket {
    constructor(public id: string, socket: ws) {
    }

    public on(event: string, listener: (...args: any[]) => void) {
        throw new Error("Method not implemented.");
    }

    public join(id: string): Promise<void> {
        throw new Error("Method not implemented.");
    }

    public emit(event: string, ...args: any[]) {
        throw new Error("Method not implemented.");
    }
}

class SocketConnection {
    public static Attach(
        socket: ws,
        orderFactory: KafkaOrdererFactory,
        tenantManager: core.ITenantManager): SocketConnection {

        const connection = new SocketConnection(socket, orderFactory, tenantManager);
        return connection;
    }
    // Map from client IDs on this connection to the object ID and user info.
    private connectionsMap = new Map<string, KafkaOrdererConnection>();
    private closed = false;

    constructor(
        private socket: ws,
        private orderFactory: KafkaOrdererFactory,
        private tenantManager: core.ITenantManager) {

        socket.on(
            "message",
            (data) => {
                // Handle the message. On any exception close the socket.
                try {
                    this.handleMessage(data);
                } catch (error) {
                    this.close(-1, error.toString());
                }
            });
        socket.on("close", (code, reason) => this.close(code, reason));
        socket.on(
            "error",
            (error) => {
                this.close();
            });
        socket.on("ping", (data) => console.log("PING!", data.toString()));
        socket.on("pong", (data) => console.log("PONG!", data.toString()));
    }

    public close(code?: number, data?: string) {
        if (this.closed) {
            return;
        }

        this.closed = true;
        this.socket.close(code, data);

        // Send notification messages for all client IDs in the connection map
        for (const [clientId, connection] of this.connectionsMap) {
            winston.info(`Disconnect of ${clientId}`);
            connection.disconnect();
        }
    }

    private handleMessage(data: ws.Data) {
        const dataString = data as string;

        const args = JSON.parse(dataString) as any[];
        const op = args[0];

        switch (op) {
            case "connect":
                const message = args[1] as socketStorage.IConnect;
                this.handleConnectDocument(message);
                break;
            case "submitOp":
                this.submitOp(args[1], args[2]);
                break;
        }
    }

    private handleConnectDocument(message: socketStorage.IConnect) {
        this.connectDocument(message).then(
            (connectedMessage) => {
                this.socket.send(`connect_document_success\0${JSON.stringify(connectedMessage)}`);
            },
            (error) => {
                winston.info(`connectDocument error`, error);
                this.socket.close(0, JSON.stringify(error));
            });
    }

    private submitOp(clientId: string, payload: string) {
        // Verify the user has connected on this object id
        if (!this.connectionsMap.has(clientId)) {
            this.socket.close(0, "Invalid client identifier");
            return;
        }

        const connection = this.connectionsMap.get(clientId);
        connection.order(payload);
    }

    private async connectDocument(message: socketStorage.IConnect): Promise<socketStorage.IConnected> {
        if (!message.token) {
            return Promise.reject("Must provide an authorization token");
        }

        // Validate token signature and claims
        const token = message.token;
        const claims = jwt.decode(token) as ITokenClaims;
        if (claims.documentId !== message.id || claims.tenantId !== message.tenantId) {
            return Promise.reject("Invalid claims");
        }
        await this.tenantManager.verifyToken(claims.tenantId, token);

        // And then connect to the orderer
        const orderer = await this.orderFactory.create(claims.tenantId, claims.documentId);
        const connection = await orderer.connect(
            new WebSocket(moniker.choose(), this.socket),
            claims.user,
            message.client);
        this.connectionsMap.set(connection.clientId, connection);

        // And return the connection information to the client
        const connectedMessage: socketStorage.IConnected = {
            clientId: connection.clientId,
            existing: connection.existing,
            maxMessageSize: connection.maxMessageSize,
            parentBranch: connection.parentBranch,
            user: claims.user,
        };

        return connectedMessage;
    }
}

export function register(
    httpServer: http.Server,
    orderFactory: KafkaOrdererFactory,
    tenantManager: core.ITenantManager) {

    const webSocketServer = new ws.Server({ server: httpServer });

    webSocketServer.on("connection", (socket: ws) => {
        SocketConnection.Attach(
            socket,
            orderFactory,
            tenantManager);
    });
}
