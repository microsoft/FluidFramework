import { IOrderer, IOrdererManager } from "../../core";
import { IProducer, KafkaOrderer } from "../../utils";

export class TestOrdererManager implements IOrdererManager {
    private orderer: IOrderer;

    constructor(producer: IProducer) {
        this.orderer = new KafkaOrderer(producer);
    }

    public getOrderer(tenantId: string, documentId: string): Promise<IOrderer> {
        return Promise.resolve(this.orderer);
    }

    public route(message) {
        return;
    }
}
