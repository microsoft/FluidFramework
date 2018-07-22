import { IOrderer, IOrdererManager } from "../../core";
import { KafkaOrdererFactory } from "./kafkaOrderer";
import { LocalOrderManager } from "./localOrderManager";

export class OrdererManager implements IOrdererManager {
    constructor(private localOrderManager: LocalOrderManager, private kafkaFactory: KafkaOrdererFactory) {
    }

    public async getOrderer(tenantId: string, documentId: string): Promise<IOrderer> {
        if (tenantId === "local") {
            return this.localOrderManager.get(tenantId, documentId);
        } else {
            return this.kafkaFactory.create(tenantId, documentId);
        }
    }
}
