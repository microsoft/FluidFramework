import { EventEmitter } from "events";
import * as _ from "lodash";
import * as ws from "ws";
import { TmzRunner } from "../../tmz/runner";
import { MongoManager } from "../../utils";
import { debug } from "../debug";
import { IConcreteNode, INode, ISocketOrderer } from "./interfaces";
import { LocalOrderer } from "./localOrderer";

// connect to service
// const socket = new ws(`ws://${server}:4000`);
// socket.on(
//     "open",
//     () => {
//         socket.send(
//             JSON.stringify({ op: "connect", tenantId, documentId }),
//             (error) => {
//                 this.queue.resume();
//             });
//     });

// socket.on(
//     "error",
//     (error) => {
//         debug(error);
//     });

// socket.on(
//     "message",
//     (data) => {
//         const parsedData = JSON.parse(data as string);
//         for (const clientSocket of this.sockets) {
//             clientSocket.send(parsedData.op, parsedData.id, parsedData.data);
//         }
//     });

// class RemoteConnection implements IOrdererSocket {
//     private q: async.AsyncQueue<core.IRawOperationMessage>;
//     private orderer: IOrderer;

//     constructor(
//         orderManager: IOrdererManager,
//         private socket: ws,
//         tenantId: string,
//         documentId: string) {

//         const ordererP = orderManager.getOrderer(this, tenantId, documentId);
//         ordererP.then(
//             (orderer) => {
//                 this.orderer = orderer;
//                 this.q.resume();
//             },
//             (error) => {
//                 this.q.kill();
//             });

//         this.q = async.queue<core.IRawOperationMessage, any>((message, callback) => {
//             this.orderer.order(message, message.documentId);
//             callback();
//         });
//         this.q.pause();
//     }

//     public order(message: core.IRawOperationMessage) {
//         this.q.push(message);
//     }

//     public send(op: string, id: string, data: any[]) {
//         this.socket.send(JSON.stringify({ op, id, data }));
//     }
// }

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
        this.webSocketServer.on("connection", (socket) => {
            // const remoteConnectionMap = new Map<string, RemoteConnection>();

            // Messages will be inbound from the remote server
            socket.on("message", (message) => {
            //     const parsed = JSON.parse(message as string);
            //     // Listen for connection requests and then messages sent to them
            //     if (parsed.op === "connect") {
            //         const remote = new RemoteConnection(
            //             this.orderManager, socket, parsed.tenantId, parsed.documentId);
            //         remoteConnectionMap.set(`${parsed.tenantId}/${parsed.documentId}`, remote);
            //     } else if (parsed.op === "message") {
            //         const rawOperation = parsed.data as core.IRawOperationMessage;
            //         const id = `${rawOperation.tenantId}/${rawOperation.documentId}`;
            //         assert(remoteConnectionMap.has(id));
            //         remoteConnectionMap.get(id).order(rawOperation);
            //     }
            });

            socket.on("close", (code, reason) => {
                debug("ws connection closed", code, reason);
            });

            socket.on("error", (error) => {
                debug("ws connection error", error);
            });
        });

        this.webSocketServer.on("error", (error) => {
            debug("wss error", error);
        });
    }

    public async connectOrderer(tenantId: string, documentId: string): Promise<ISocketOrderer> {
        // Our node is responsible for sequencing messages
        debug(`${this.id} Becoming leader for ${tenantId}/${documentId}`);
        const orderer = LocalOrderer.Load(
            this.mongoManager,
            tenantId,
            documentId,
            this.documentsCollectionName,
            this.deltasCollectionName,
            this.tmzRunner);

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
