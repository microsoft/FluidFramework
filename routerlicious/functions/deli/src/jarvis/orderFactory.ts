import { KafkaOrderer, KafkaOrdererFactory } from "./kafkaOrderer";
import { LocalOrderer, LocalOrdererFactory } from "./localOrderer";

export class OrdererManager {
    constructor(private localOrderManager: LocalOrdererFactory, private kafkaFactory?: KafkaOrdererFactory) {
    }

    public async getOrderer(tenantId: string, documentId: string): Promise<LocalOrderer | KafkaOrderer> {
        if (tenantId === "local" || !this.kafkaFactory) {
            return this.localOrderManager.create(tenantId, documentId);
        } else {
            return this.kafkaFactory.create(tenantId, documentId);
        }
    }
}
