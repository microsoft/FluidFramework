import { IOrderer, IOrdererManager, IRawOperationMessage } from "../core";
import { IProducer, KafkaOrderer } from "../utils";
import { debug } from "./debug";

// Want a pure local orderer that can do all kinds of stuff
export class LocalOrderer implements IOrderer {
    public static async Load(tenantId: string, documentId: string): Promise<LocalOrderer> {
        return new LocalOrderer();
    }

    private sockets = new Array<any>();

    private constructor() {
    }

    public async order(message: IRawOperationMessage, topic: string): Promise<void> {
        debug("Hey - I was asked to order!");
        return;
    }

    public attachSocket(socket: any) {
        this.sockets.push(socket);
    }
}

export class OrdererManager implements IOrdererManager {
    // TODO instantiate the orderer from a passed in config/tenant manager rather than assuming just one
    private orderer: IOrderer;
    private localOrderers = new Map<string, Promise<LocalOrderer>>();

    constructor(producer: IProducer) {
        this.orderer = new KafkaOrderer(producer);
    }

    public getOrderer(socket: any, tenantId: string, documentId: string): Promise<IOrderer> {
        if (tenantId === "local") {
            if (!this.localOrderers.has(documentId)) {
                const ordererP = LocalOrderer.Load(tenantId, documentId);
                this.localOrderers.set(documentId, ordererP);
            }

            return this.localOrderers.get(documentId).then(
                (orderer) => {
                    orderer.attachSocket(socket);
                    return orderer;
                });
        } else {
            return Promise.resolve(this.orderer);
        }
    }
}
