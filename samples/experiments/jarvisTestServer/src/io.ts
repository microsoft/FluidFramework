import { IDocumentMessage, ITokenClaims } from "@prague/runtime-definitions";
import * as core from "@prague/services-core";
import * as socketStorage from "@prague/socket-storage";
import * as http from "http";
import * as jwt from "jsonwebtoken";
import * as moniker from "moniker";
import * as winston from "winston";
import * as ws from "ws";
import { KafkaOrdererConnection } from "./kafkaOrderer";
// import { OrdererManager } from "./orderFactory";
// import { RedisSubscriptionManager } from "./subscriptions";

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
    private topics = new Array<string>();

    constructor(public id: string, private socket: ws /*, private subscriber: RedisSubscriptionManager*/) {
        socket.onclose = () => {
            throw new Error( "NYI" );
            // for (const room of this.topics) {
            //    subscriber.unsubscribe(room, socket);
            // }
        };
    }

    public on(event: string, listener: (...args: any[]) => void) {
        throw new Error("Method not implemented.");
    }

    public async join(id: string): Promise<void> {
        this.topics.push(id);
        throw new Error( "NYI" );
        // await this.subscriber.subscribe(id, this.socket);
    }

    public emit(event: string, ...args: any[]) {
        this.socket.send(JSON.stringify([event].concat(...args)));
    }

    public broadcast(event: string, ...args: any[]) {
        throw new Error("Method not implemented.");
    }
}

class SocketConnection {
    public static attach(
        socket: ws,
        //orderFactory: OrdererManager,
        tenantManager: core.ITenantManager,
        //subscriber: RedisSubscriptionManager
        ): SocketConnection {

        const connection = new SocketConnection(socket, /*orderFactory,*/ tenantManager/*, subscriber*/);
        return connection;
    }
    // Map from client IDs on this connection to the object ID and user info.
    private connectionsMap = new Map<string, KafkaOrdererConnection>();
    private closed = false;
    private webSocket: WebSocket;

    constructor(
        private socket: ws,
        //private orderFactory: OrdererManager,
        private tenantManager: core.ITenantManager,
        //subscriber: RedisSubscriptionManager
        ) {

        this.webSocket = new WebSocket(moniker.choose(), this.socket /*, subscriber*/ );

        this.webSocket;

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
        socket.on(
            "close",
            (code, reason) => {
                winston.info("close", code, reason);
                this.close(code, reason);
            });
        socket.on(
            "error",
            (error) => {
                winston.info("error");
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
        const args = JSON.parse(data as string) as any[];
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
        this.connectDocument(message).catch(
            (error) => {
                winston.info(`connectDocument error`, error);
                this.socket.close(1002, JSON.stringify(error));
            });
    }

    private submitOp(clientId: string, payload: IDocumentMessage[]) {
        // Verify the user has connected on this object id
        if (!this.connectionsMap.has(clientId)) {
            this.socket.close(0, "Invalid client identifier");
            return;
        }

        const connection = this.connectionsMap.get(clientId);
        for (const message of payload) {
            connection.order(message);
        }
    }

    private async connectDocument(message: socketStorage.IConnect): Promise<void> {
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

        throw new Error( "NYI" );

        // And then connect to the orderer
        // const orderer = await this.orderFactory.getOrderer(claims.tenantId, claims.documentId);
        // const connection = await orderer.connect(claims.user, message.client);
        // this.connectionsMap.set(connection.clientId, connection);

        // And return the connection information to the client
        // const connectedMessage: socketStorage.IConnected = {
        //     clientId: connection.clientId,
        //     existing: connection.existing,
        //     maxMessageSize: connection.maxMessageSize,
        //     parentBranch: connection.parentBranch,
        //     user: claims.user,
        // };

        // this.socket.send(JSON.stringify(["connect_document_success", connectedMessage]));

        // await connection.bind(this.webSocket);
    }
}

export function register(
    httpServer: http.Server,
    //orderFactory: OrdererManager,
    tenantManager: core.ITenantManager,
    //redisConfig: { host: string, port: number }
    ) {

    const webSocketServer = new ws.Server({ server: httpServer });
    //const subscriber = new RedisSubscriptionManager(redisConfig.host, redisConfig.port);

    webSocketServer.on("connection", (socket: ws) => {
        SocketConnection.attach(
            socket,
            //orderFactory,
            tenantManager,
            //subscriber
            );
    });
}
