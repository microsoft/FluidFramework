import * as assert from "assert";
import { EventEmitter } from "events";
import * as _ from "lodash";
import * as ws from "ws";
import { IOrdererSocket, IRawOperationMessage } from "../../core";
import { TmzRunner } from "../../tmz/runner";
import { MongoManager } from "../../utils";
import { debug } from "../debug";
import { IConcreteNode, INode, INodeMessage, IOpMessage, ISocketOrderer } from "./interfaces";
import { LocalOrderer } from "./localOrderer";
import { Socket } from "./socket";

class ProxySocket implements IOrdererSocket {
    constructor(private socket: Socket<INodeMessage>) {
    }

    public send(topic: string, op: string, id: string, data: any[]) {
        const payload: IOpMessage = {
            data,
            id,
            op,
            topic,
        };
        const nodeMessage: INodeMessage = {
            payload,
            type: "op",
        };

        this.socket.send(nodeMessage);
    }
}

// Local node manages maintaining the reservation. As well as handling managing the local orderers.
// Messages sent to it are directly routed.
export class LocalNode extends EventEmitter implements IConcreteNode {
    public static async Connect(
        id: string,
        address: string,
        mongoManager: MongoManager,
        nodeCollectionName: string,
        documentsCollectionName: string,
        deltasCollectionName: string,
        tmzRunner: TmzRunner,
        timeoutLength: number) {

        // Look up any existing information for the node or create a new one
        const node = await LocalNode.Create(
            id,
            address,
            nodeCollectionName,
            mongoManager,
            timeoutLength);

        return new LocalNode(
            node,
            mongoManager,
            nodeCollectionName,
            documentsCollectionName,
            deltasCollectionName,
            tmzRunner,
            timeoutLength);
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

    private constructor(
        private node: INode,
        private mongoManager: MongoManager,
        private nodeCollectionName: string,
        private documentsCollectionName: string,
        private deltasCollectionName: string,
        private tmzRunner: TmzRunner,
        private timeoutLength: number) {
        super();

        // Schedule the first heartbeat to update the reservation
        this.scheduleHeartbeat();

        // Start up the peer-to-peer socket server to listen to inbound messages
        this.webSocketServer = new ws.Server({ port: 4000 });

        // Connections will arrive from remote nodes
        this.webSocketServer.on("connection", (wsSocket, request) => {
            debug(`New inbound web socket connection ${request.url}`);
            const socket = new Socket<INodeMessage>(wsSocket);

            // Messages will be inbound from the remote server
            socket.on("message", (message) => {
                if (message.type === "join") {
                    const fullId = message.payload as string;
                    if (!this.orderMap.has(fullId)) {
                        debug("Received message for un-owned document", fullId);
                        return;
                    }

                    debug(`Join of ${fullId}`);
                    this.orderMap.get(fullId).attachSocket(new ProxySocket(socket));
                } else if (message.type === "order") {
                    const orderMessage = message.payload as IRawOperationMessage;
                    const fullId = `${orderMessage.tenantId}/${orderMessage.documentId}`;
                    if (!this.orderMap.has(fullId)) {
                        debug("Received message for un-owned document", fullId);
                        return;
                    }

                    // debug(`Order ${orderMessage.clientId}@${orderMessage.operation.clientSequenceNumber}`);
                    this.orderMap.get(fullId).order(orderMessage);
                }
            });
        });

        this.webSocketServer.on("error", (error) => {
            debug("wss error", error);
        });
    }

    public async connectOrderer(tenantId: string, documentId: string): Promise<ISocketOrderer> {
        const fullId = `${tenantId}/${documentId}`;
        // Our node is responsible for sequencing messages
        debug(`${this.id} Becoming leader for ${fullId}`);
        const orderer = await LocalOrderer.Load(
            this.mongoManager,
            tenantId,
            documentId,
            this.documentsCollectionName,
            this.deltasCollectionName,
            this.tmzRunner);
        assert(!this.orderMap.has(fullId));
        this.orderMap.set(fullId, orderer);

        return orderer;
    }

    public send(message: any) {
        return;
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
                            debug(`Successfully renewed expiration for ${this.node._id}`);
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
