import * as assert from "assert";
import { EventEmitter } from "events";
import * as _ from "lodash";
import { MongoManager } from "../../utils";
import { debug } from "../debug";
import { IConcreteNode, IConcreteNodeFactory } from "./interfaces";

// import * as ws from "ws";
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

/**
 * Identifier for an ordering node in the system
 */
interface INode {
    // Unique identifier for the node
    _id: string;

    // Address that the node can be reached at
    address: string;

    // Time when the node is set to expire
    expiration: number;
}

/**
 * Connection to a remote node
 */
class RemoteNode extends EventEmitter implements IConcreteNode {
    // private lastUpdate = Date.now();

    public static async Connect(
        id: string,
        mongoManager: MongoManager,
        nodeCollectionName: string): Promise<RemoteNode> {

        const node = new RemoteNode(id, mongoManager, nodeCollectionName);
        await node.connect();

        return node;
    }

    public get id(): string {
        return this._id;
    }

    public get valid(): boolean {
        return this._valid;
    }

    // tslint:disable:variable-name
    private _id: string;
    private _valid: boolean;
    // tslint:enable:variable-name

    // TODO establish some kind of connection to the node from here?
    // should I rely on the remote node to update me of its details? And only fall back to mongo if necessary?
    // I can probably assume it's all good so long as it tells me things are good. And then I avoid the update loop.
    // Expired nodes I can track separately.

    private constructor(id: string, private mongoManager: MongoManager, private nodeCollectionName: string) {
        super();

        this._id = id;
        this._valid = true;
    }

    public send(message: any) {
        return;
    }

    public async connect(): Promise<void> {
        const db = await this.mongoManager.getDatabase();
        const nodeCollection = db.collection<INode>(this.nodeCollectionName);
        const details = await nodeCollection.findOne({ _id: this._id });

        if (details.expiration < Date.now()) {
            this._valid = false;
        } else {
            this._valid = true;
        }

        // TODO establish websocket connection to remote server. Node stays valid so long as the connection is open
        // and the remote channel keeps it open. If the connection is lost we will attempt to reconnect and
        // continue to buffer messages. Reconnection will indicate node loss and we will use that to set the invalid
        // flag
    }
}

export class LocalNodeFactory implements IConcreteNodeFactory {
    public create(): Promise<LocalNode> {
        return null;
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
        timeoutLength: number) {

        // Look up any existing information for the node or create a new one
        const node = await LocalNode.Create(
            id,
            address,
            nodeCollectionName,
            mongoManager,
            timeoutLength);

        return new LocalNode(node, mongoManager, nodeCollectionName, timeoutLength);
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

    private constructor(
        private node: INode,
        private mongoManager: MongoManager,
        private nodeCollectionName: string,
        private timeoutLength: number) {
        super();

        // Schedule the first heartbeat to update the reservation
        this.scheduleHeartbeat();
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

/**
 * Tracks the validity of a set of nodes.
 */
export class NodeManager extends EventEmitter {
    // Every node we have ever loaded
    private nodes = new Map<string, IConcreteNode>();
    // Nodes we are attempting to load
    private pendingNodes = new Map<string, Promise<IConcreteNode>>();

    constructor(
        private mongoManager: MongoManager,
        private nodeCollectionName: string) {
        super();
    }

    /**
     * Registers a new local node with the NodeManager
     */
    public registerLocal(node: IConcreteNode): void {
        // Verify the node hasn't been previously registered
        assert(!this.nodes.has(node.id));
        assert(!this.pendingNodes.has(node.id));

        // Add the local node to the list. We do not add it to the valid list because we do not track the validity
        // of a local node.
        this.nodes.set(node.id, node);
    }

    /**
     * Loads the given remote node with the provided ID
     */
    public loadRemote(id: string): Promise<IConcreteNode> {
        // Return immediately if have the resolved value
        if (this.nodes.has(id)) {
            return Promise.resolve(this.nodes.get(id));
        }

        // Otherwise return a promise for the node
        if (this.pendingNodes.has(id)) {
            return this.pendingNodes.get(id);
        }

        // Otherwise load in the information
        const pendingNodeP = this.getNode(id);
        this.pendingNodes.set(id, pendingNodeP);

        return pendingNodeP;
    }

    private async getNode(id: string): Promise<IConcreteNode> {
        const node = await RemoteNode.Connect(id, this.mongoManager, this.nodeCollectionName);
        this.nodes.set(id, node);

        // TODO Register for node events here
        // node.on("error", (error) => { });

        return node;
    }
}
