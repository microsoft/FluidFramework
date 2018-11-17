import * as core from "@prague/routerlicious/dist/core";
import * as utils from "@prague/routerlicious/dist/utils";
import { EventEmitter } from "events";
import { Provider } from "nconf";
import { IContext, IPartitionLambda, IPartitionLambdaFactory } from "../kafka-service/lambdas";
import { DeliLambda } from "./lambda";

// We expire clients after 5 minutes of no activity
export const ClientSequenceTimeout = 5 * 60 * 1000;

// Timeout for sending no-ops to trigger inactivity checker.
export const ActivityCheckingTimeout = 30 * 1000;

export class DeliLambdaFactory extends EventEmitter implements IPartitionLambdaFactory {
    constructor(
        private mongoManager: utils.MongoManager,
        private collection: core.ICollection<core.IDocument>,
        private forwardProducer: utils.IProducer,
        private reverseProducer: utils.IProducer) {
        super();
    }

    public async create(config: Provider, context: IContext): Promise<IPartitionLambda> {
        const documentId = config.get("documentId");
        const tenantId = config.get("tenantId");

        // Lookup the last sequence number stored
        // TODO - is this storage specific to the orderer in place? Or can I generalize the output context?
        const dbObject = await this.collection.findOne({ documentId, tenantId });
        if (!dbObject) {
            return Promise.reject(`${tenantId}/${documentId} does not exist - cannot sequence`);
        }

        return new DeliLambda(
            context,
            tenantId,
            documentId,
            dbObject,
            // It probably shouldn't take the collection - I can manage that
            this.collection,
            // The producer as well it shouldn't take. Maybe it just gives an output stream?
            this.forwardProducer,
            this.reverseProducer,
            ClientSequenceTimeout,
            ActivityCheckingTimeout);
    }

    public async dispose(): Promise<void> {
        const mongoClosedP = this.mongoManager.close();
        const forwardProducerClosedP = this.forwardProducer.close();
        const reverseProducerClosedP = this.reverseProducer.close();
        await Promise.all([mongoClosedP,  forwardProducerClosedP, reverseProducerClosedP]);
    }
}
