import * as assert from "assert";
import * as async from "async";
import { EventEmitter } from "events";
import * as ws from "ws";
import { MongoManager } from "../../utils";
import { debug } from "../debug";
import { IConcreteNode, INode, INodeMessage, IOpMessage, ISocketOrderer } from "./interfaces";
import { ProxyOrderer } from "./proxyOrderer";

/**
 * Connection to a remote node
 */
export class RemoteNode extends EventEmitter implements IConcreteNode {
    public static async Connect(
        id: string,
        mongoManager: MongoManager,
        nodeCollectionName: string): Promise<RemoteNode> {

        const db = await mongoManager.getDatabase();
        const nodeCollection = db.collection<INode>(nodeCollectionName);
        const details = await nodeCollection.findOne({ _id: id });

        const valid = details.expiration >= Date.now();
        const node = new RemoteNode(id, details.address, valid);

        return node;
    }

    public get id(): string {
        return this._id;
    }

    public get valid(): boolean {
        return this._valid;
    }

    private socket: ws;
    private outbound: async.AsyncQueue<INodeMessage>;
    private orderers = new Map<string, ProxyOrderer>();

    // TODO establish some kind of connection to the node from here?
    // should I rely on the remote node to update me of its details? And only fall back to mongo if necessary?
    // I can probably assume it's all good so long as it tells me things are good. And then I avoid the update loop.
    // Expired nodes I can track separately.

    // tslint:disable-next-line:variable-name
    private constructor(private _id: string, address: string, private _valid: boolean) {
        super();

        this.socket = new ws(`ws://${address}/${this.id}`);
        this.socket.on(
            "open",
            () => {
                this.outbound.resume();
            });

        this.socket.on(
            "error",
            (error) => {
                debug(`ws error on connection to ${this.id}`, error);
                this.outbound.pause();
            });

        this.socket.on(
            "close",
            (code, reason) => {
                debug(`ws to ${this.id} close ${code} ${reason}`);
                this.outbound.pause();
            });

        this.socket.on(
            "message",
            (message) => {
                const parsed = JSON.parse(message as string) as INodeMessage;

                if (parsed.type === "op") {
                    const opMessage = parsed.payload as IOpMessage;
                    if (!this.orderers.get(opMessage.topic)) {
                        debug(`No orderer for ${opMessage.topic}`);
                        return;
                    }

                    this.orderers.get(opMessage.topic).broadcast(opMessage);
                }
            });

        this.outbound = async.queue(
            (value, callback) => {
                this.socket.send(JSON.stringify(value));
                callback();
            },
            1);
        this.outbound.pause();
    }

    public async connectOrderer(tenantId: string, documentId: string): Promise<ISocketOrderer> {
        const fullId = `${tenantId}/${documentId}`;
        debug(`Connecting to ${fullId}:${this.id}`);
        const orderer = new ProxyOrderer(
            tenantId,
            documentId,
            (message) => this.outbound.push({ type: "order", payload: message }));
        assert(!this.orderers.has(fullId));

        this.orderers.set(fullId, orderer);
        this.outbound.push({ type: "join", payload: fullId });

        return orderer;
    }
}
