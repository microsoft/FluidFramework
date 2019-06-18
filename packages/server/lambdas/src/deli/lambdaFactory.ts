/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    ICollection,
    IContext,
    IDocument,
    IPartitionLambda,
    IPartitionLambdaFactory,
    IProducer,
    MongoManager,
} from "@prague/services-core";
import { EventEmitter } from "events";
import { Provider } from "nconf";
import { DeliLambda } from "./lambda";

// We expire clients after 5 minutes of no activity
export const ClientSequenceTimeout = 5 * 60 * 1000;

// Timeout for sending no-ops to trigger inactivity checker.
export const ActivityCheckingTimeout = 30 * 1000;

// Timeout for sending consolidated no-ops.
export const NoopConsolidationTimeout = 250;

export class DeliLambdaFactory extends EventEmitter implements IPartitionLambdaFactory {
    constructor(
        private mongoManager: MongoManager,
        private collection: ICollection<IDocument>,
        private forwardProducer: IProducer,
        private reverseProducer: IProducer) {
        super();
    }

    public async create(config: Provider, context: IContext): Promise<IPartitionLambda> {
        const documentId = config.get("documentId");
        const tenantId = config.get("tenantId");

        // Lookup the last sequence number stored
        // TODO - is this storage specific to the orderer in place? Or can I generalize the output context?
        let dbObject = await this.collection.findOne({ documentId, tenantId });
        if (!dbObject) {
            // Temporary guard against failure until we figure out what causing this to trigger.
            dbObject = {
                branchMap: null,
                clients: null,
                createTime: Date.now(),
                documentId,
                forks: [],
                logOffset: null,
                parent: null,
                scribe: {
                    logOffset: -1,
                    proposals: [],
                },
                sequenceNumber: 0,
                tenantId,
            };
            // return Promise.reject(`${tenantId}/${documentId} does not exist - cannot sequence`);
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
            ActivityCheckingTimeout,
            NoopConsolidationTimeout);
    }

    public async dispose(): Promise<void> {
        const mongoClosedP = this.mongoManager.close();
        const forwardProducerClosedP = this.forwardProducer.close();
        const reverseProducerClosedP = this.reverseProducer.close();
        await Promise.all([mongoClosedP,  forwardProducerClosedP, reverseProducerClosedP]);
    }
}
