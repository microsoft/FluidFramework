import { IOrderer, IOrdererManager } from "../core";
import { IProducer, KafkaOrderer } from "../utils";

export class OrdererManager implements IOrdererManager {
    // TODO instantiate the orderer from a passed in config/tenant manager rather than assuming just one
    private orderer: IOrderer;

    constructor(producer: IProducer) {
        this.orderer = new KafkaOrderer(producer);
    }

    public getOrderer(tenantId: string, documentId: string): Promise<IOrderer> {
        return Promise.resolve(this.orderer);
    }
}
