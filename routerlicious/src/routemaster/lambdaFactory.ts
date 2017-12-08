import { Provider } from "nconf";
import * as core from "../core";
import { IContext, IPartitionLambda, IPartitionLambdaFactory } from "../kafka-service/lambdas";
import * as utils from "../utils";
import { DocumentManager } from "./documentManager";
import { RouteMasterLambda } from "./lambda";

export class RouteMasterLambdaFactory implements IPartitionLambdaFactory {
    constructor(
        private mongoManager: utils.MongoManager,
        private collection: core.ICollection<any>,
        private deltas: core.ICollection<any>,
        private producer: utils.kafkaProducer.IProducer) {
    }

    public async create(config: Provider, context: IContext): Promise<IPartitionLambda> {
        const id = config.get("documentId");
        const documentDetails = await DocumentManager.Create(id, this.collection, this.deltas);

        return new RouteMasterLambda(documentDetails, this.producer, context);
    }

    public async dispose(): Promise<void> {
        // TODO shut down any created lambdas and wait for all messages to complete?

        const producerClosedP = this.producer.close();
        const mongoClosedP = this.mongoManager.close();
        await Promise.all([producerClosedP, mongoClosedP]);
    }
}
