import * as assert from "assert";
import { EventEmitter } from "events";
import * as _ from "lodash";
import * as uuid from "uuid/v4";
import * as ws from "ws";
import * as api from "../../api-core";
import { IDocumentStorage, IOrderer, IOrdererConnection, ITaskMessageSender } from "../../core";
import * as services from "../../services";
import { MongoManager } from "../../utils";
import { debug } from "../debug";
import {
    IConcreteNode, IConnectedMessage, IConnectMessage, INode, INodeMessage, IOpMessage,
} from "./interfaces";
import { ISubscriber, LocalOrderer } from "./localOrderer";
import { Socket } from "./socket";

// Can I treat each Alfred as a mini-Kafka. And consolidate all the deli logic together?
// Rather than creating one per? I'm in some ways on this path.

class RemoteSubscriber implements ISubscriber {
    public id = uuid();

    constructor(private socket: Socket<INodeMessage>) {
    }

    public send(topic: string, event: string, ...args: any[]): void {
        const opMessage: IOpMessage = {
            data: args,
            op: event,
            topic,
        };

        const message: INodeMessage = {
            cid: -1,
            payload: opMessage,
            type: "op",
        };

        this.socket.send(message);
    }
}

// Local node manages maintaining the reservation. As well as handling managing the local orderers.
// Messages sent to it are directly routed.
export class LocalNode extends EventEmitter implements IConcreteNode {
    public static async Connect(
        id: string,
        address: string,
        storage: IDocumentStorage,
        mongoManager: MongoManager,
        nodeCollectionName: string,
        documentsCollectionName: string,
        deltasCollectionName: string,
        timeoutLength: number,
        taskMessageSender: ITaskMessageSender,
        tenantManager: services.TenantManager,
        permission: any) {

        // Look up any existing information for the node or create a new one
        const node = await LocalNode.Create(
            id,
            address,
            nodeCollectionName,
            mongoManager,
            timeoutLength);

        return new LocalNode(
            node,
            storage,
            mongoManager,
            nodeCollectionName,
            documentsCollectionName,
            deltasCollectionName,
            timeoutLength,
            taskMessageSender,
            tenantManager,
            permission);
    }

    private static async Create(
        id: string,
        address: string,
        nodeCollectionName: string,
        mongoManager: MongoManager,
        timeoutLength: number): Promise<INode> {

        debug("Creating node", id);

        const db = await mongoManager.getDatabase();
        const nodeCollection = db.collection<INode>(nodeCollectionName);
        const node = {
            _id: id,
            address,
            expiration: Date.now() + timeoutLength,
        };
        await nodeCollection.insertOne(node);

        return node;
    }

    private static async UpdateExpiration(
        existing: INode,
        nodeCollectionName: string,
        mongoManager: MongoManager,
        timeoutLength: number): Promise<INode> {

        const db = await mongoManager.getDatabase();
        const nodeCollection = db.collection<INode>(nodeCollectionName);
        const newExpiration = Date.now() + timeoutLength;

        await nodeCollection.update(
            {
                _id: existing._id,
                expiration: existing.expiration,
            },
            {
                expiration: newExpiration,
            },
            null);

        const result = _.clone(existing);
        result.expiration = newExpiration;

        return result;
    }

    public get id(): string {
        return this.node._id;
    }

    public get valid(): boolean {
        return true;
    }

    private webSocketServer: ws.Server;
    private orderMap = new Map<string, LocalOrderer>();
    private connectionMap = new Map<number, IOrdererConnection>();

    private constructor(
        private node: INode,
        private storage: IDocumentStorage,
        private mongoManager: MongoManager,
        private nodeCollectionName: string,
        private documentsCollectionName: string,
        private deltasCollectionName: string,
        private timeoutLength: number,
        private taskMessageSender: ITaskMessageSender,
        private tenantManager: services.TenantManager,
        private permission: any) {
        super();

        // Schedule the first heartbeat to update the reservation
        this.scheduleHeartbeat();

        // Start up the peer-to-peer socket server to listen to inbound messages
        this.webSocketServer = new ws.Server({ port: 4000 });

        // Connections will arrive from remote nodes
        this.webSocketServer.on("connection", (wsSocket, request) => {
            debug(`New inbound web socket connection ${request.url}`);
            const socket = new Socket<INodeMessage>(wsSocket);
            const subscriber = new RemoteSubscriber(socket);

            // Messages will be inbound from the remote server
            socket.on("message", (message) => {
                switch (message.type) {
                    case "connect": {
                        const connectMessage = message.payload as IConnectMessage;
                        const fullId = `${connectMessage.tenantId}/${connectMessage.documentId}`;
                        const orderer = this.orderMap.get(fullId);
                        assert(orderer);

                        // Create a new socket and bind it to a relay on the node
                        const connection = orderer.connectInternal(
                            subscriber,
                            connectMessage.user,
                            connectMessage.client);

                        // Need to subscribe to both channels. Then broadcast subscription across pipe
                        // on receiving a message
                        this.connectionMap.set(message.cid, connection);

                        // emit connected message
                        const connected: IConnectedMessage = {
                            clientId: connection.clientId,
                            existing: connection.existing,
                            parentBranch: connection.parentBranch,
                        };
                        socket.send({ cid: message.cid, type: "connected", payload: connected });

                        break;
                    }

                    case "disconnect": {
                        const connection = this.connectionMap.get(message.cid);
                        assert(connection);
                        connection.disconnect();
                        this.connectionMap.delete(message.cid);

                        break;
                    }

                    case "order": {
                        const orderMessage = message.payload as api.IDocumentMessage;
                        const connection = this.connectionMap.get(message.cid);
                        assert(connection);
                        connection.order(orderMessage);
                        break;
                    }
                }
            });
        });

        this.webSocketServer.on("error", (error) => {
            debug("wss error", error);
        });
    }

    public async connectOrderer(tenantId: string, documentId: string): Promise<IOrderer> {
        const fullId = `${tenantId}/${documentId}`;
        // Our node is responsible for sequencing messages
        debug(`${this.id} Becoming leader for ${fullId}`);
        const orderer = await LocalOrderer.Load(
            this.storage,
            this.mongoManager,
            tenantId,
            documentId,
            this.documentsCollectionName,
            this.deltasCollectionName,
            this.taskMessageSender,
            this.tenantManager,
            this.permission);
        assert(!this.orderMap.has(fullId));
        this.orderMap.set(fullId, orderer);

        return orderer;
    }

    private scheduleHeartbeat() {
        const now = Date.now();

        // Check to see if we can even renew at this point
        if (now > this.node.expiration) {
            // Have lost the node. Need to shutdown everything and close down
            debug(`${this.node._id} did not renew before expiration`);
            this.emit("expired");

            // TODO close the web socket server
        } else {
            // Schedule a heartbeat at the midpoint of the timeout length
            const targetTime = this.node.expiration - (this.timeoutLength / 2);
            const delta = Math.max(0, targetTime - Date.now());

            setTimeout(
                () => {
                    const updateP = LocalNode.UpdateExpiration(
                        this.node,
                        this.nodeCollectionName,
                        this.mongoManager,
                        this.timeoutLength);
                    updateP.then(
                        (newNode) => {
                            // debug(`Successfully renewed expiration for ${this.node._id}`);
                            this.node = newNode;
                            this.scheduleHeartbeat();
                        },
                        (error) => {
                            // Try again immediately.
                            debug(`Failed to renew expiration for ${this.node._id}`, error);
                            this.scheduleHeartbeat();
                        });
                },
                delta);
        }
    }
}
