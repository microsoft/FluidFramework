import { IOrderer, IOrdererManager, IOrdererSocket } from "../../core";
import { KafkaOrderer } from "../../utils";
import { LocalOrderManager } from "./localOrderManager";

export class OrdererManager implements IOrdererManager {
    constructor(private localOrderManager: LocalOrderManager, private kafkaOrderer: KafkaOrderer) {
    }

    public getOrderer(
        socket: IOrdererSocket,
        tenantId: string,
        documentId: string): Promise<IOrderer> {

        if (tenantId === "local") {
            return this.localOrderManager.get(tenantId, documentId).then(
                (orderer) => {
                    orderer.attachSocket(socket);
                    return orderer;
                });
        } else {
            return Promise.resolve(this.kafkaOrderer);
        }
    }
}
