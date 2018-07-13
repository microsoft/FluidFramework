import * as assert from "assert";
import { EventEmitter } from "events";
import { MongoManager } from "../../utils";
import { debug } from "../debug";
import { IConcreteNode, INode, INodeMessage, IOpMessage, ISocketOrderer } from "./interfaces";
import { ProxyOrderer } from "./proxyOrderer";
import { Socket } from "./socket";

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

        const socket = details.expiration >= Date.now()
            ? await Socket.Connect<INodeMessage>(details.address, id)
            : null;
        const node = new RemoteNode(id, socket);

        return node;
    }

    public get id(): string {
        return this._id;
    }

    public get valid(): boolean {
        return this.socket !== null;
    }

    private orderers = new Map<string, ProxyOrderer>();

    // TODO establish some kind of connection to the node from here?
    // should I rely on the remote node to update me of its details? And only fall back to mongo if necessary?
    // I can probably assume it's all good so long as it tells me things are good. And then I avoid the update loop.
    // Expired nodes I can track separately.

    // tslint:disable-next-line:variable-name
    private constructor(private _id: string, private socket: Socket<INodeMessage>) {
        super();

        this.socket.on(
            "message",
            (message) => {
                if (message.type === "op") {
                    const opMessage = message.payload as IOpMessage;
                    if (!this.orderers.get(opMessage.topic)) {
                        debug(`No orderer for ${opMessage.topic}`);
                        return;
                    }

                    this.orderers.get(opMessage.topic).broadcast(opMessage);
                }
            });
    }

    public async connectOrderer(tenantId: string, documentId: string): Promise<ISocketOrderer> {
        const fullId = `${tenantId}/${documentId}`;
        debug(`Connecting to ${fullId}:${this.id}`);
        const orderer = new ProxyOrderer(
            tenantId,
            documentId,
            (message) => this.socket.send({ type: "order", payload: message }));
        assert(!this.orderers.has(fullId));

        this.orderers.set(fullId, orderer);
        this.socket.send({ type: "join", payload: fullId });

        return orderer;
    }
}
