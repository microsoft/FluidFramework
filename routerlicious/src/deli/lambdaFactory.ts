import { Provider } from "nconf";
import * as core from "../core";
import { IContext, IPartitionLambda, IPartitionLambdaFactory } from "../kafka-service/lambdas";
import * as utils from "../utils";
import { DeliLambda } from "./lambda";

// We expire clients after 5 minutes of no activity
export const ClientSequenceTimeout = 5 * 60 * 1000;

export class DeliLambdaFactory implements IPartitionLambdaFactory {
    constructor(
        private mongoManager: utils.MongoManager,
        private collection: core.ICollection<core.IDocument>,
        private producer: utils.kafkaProducer.IProducer) {
    }

    public async create(config: Provider, context: IContext): Promise<IPartitionLambda> {
        const documentId = config.get("documentId");
        const tenantId = config.get("tenantId");

        // Lookup the last sequence number stored
        const dbObject = await this.collection.findOne({ documentId, tenantId });
        if (!dbObject) {
            return Promise.reject("Object does not exist - cannot sequence");
        }

        return new DeliLambda(
            context,
            tenantId,
            documentId,
            dbObject,
            this.collection,
            this.producer,
            ClientSequenceTimeout);
    }

    public async dispose(): Promise<void> {
        const mongoClosedP = this.mongoManager.close();
        const producerClosedP = this.producer.close();
        await Promise.all([mongoClosedP,  producerClosedP]);
    }
}
