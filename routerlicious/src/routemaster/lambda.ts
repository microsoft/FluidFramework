import * as core from "../core";
import { IPartitionLambda } from "../kafka-service/lambdas";
import * as utils from "../utils";

export class RouteMasterLambda implements IPartitionLambda {
    constructor(
        private mongoManager: utils.MongoManager,
        collection: core.ICollection<core.IDocument>,
        deltas: core.ICollection<core.ISequencedOperationMessage>,
        private producer: utils.kafkaProducer.IProducer) {
    }

    public async handler(rawMessage: utils.kafkaConsumer.IMessage): Promise<any> {
        const message = JSON.parse(rawMessage.value) as core.ISequencedOperationMessage;
        if (message.type !== core.SequencedOperationType) {
            return;
        }

        // // TODO create the context under which to operate
        // // Create the router if it doesn't exist
        // if (!this.routers.has(message.documentId)) {
        //     const router = new Router(message.documentId, this.objectsCollection, this.deltas, this.producer);
        //     this.routers.set(message.documentId, router);
        // }

        // // Route the message
        // const router = this.routers.get(message.documentId);
        // router.route(message);

        // partitionManager.update(rawMessage.partition, rawMessage.offset);
    }

    public async dispose(): Promise<void> {
        const producerClosedP = this.producer.close();
        const mongoClosedP = this.mongoManager.close();
        await Promise.all([producerClosedP, mongoClosedP]);
    }
}
