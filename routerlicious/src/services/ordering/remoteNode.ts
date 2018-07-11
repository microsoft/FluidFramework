import { EventEmitter } from "events";
import { MongoManager } from "../../utils";
import { debug } from "../debug";
import { IConcreteNode, INode, ISocketOrderer } from "./interfaces";
import { ProxyOrderer } from "./proxyOrderer";

/**
 * Connection to a remote node
 */
export class RemoteNode extends EventEmitter implements IConcreteNode {
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

    public async connectOrderer(tenantId: string, documentId: string): Promise<ISocketOrderer> {
        // TOOD - will need to check the time on the lease and then take it
        debug(`Connecting to ${tenantId}/${documentId}:${this.id}`);
        // Reservation exists - have the orderer simply establish a WS connection to it and proxy commands
        return new ProxyOrderer(tenantId, documentId);
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
