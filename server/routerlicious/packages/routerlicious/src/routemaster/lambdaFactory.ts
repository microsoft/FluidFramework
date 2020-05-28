/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventEmitter } from "events";
import {
    ICollection,
    IContext,
    IPartitionLambda,
    IPartitionLambdaFactory,
    IProducer,
    MongoManager,
} from "@fluidframework/server-services-core";
import { Provider } from "nconf";
import { DocumentManager } from "./documentManager";
import { RouteMasterLambda } from "./lambda";

export class RouteMasterLambdaFactory extends EventEmitter implements IPartitionLambdaFactory {
    constructor(
        private readonly mongoManager: MongoManager,
        private readonly collection: ICollection<any>,
        private readonly deltas: ICollection<any>,
        private readonly producer: IProducer) {
        super();
    }

    public async create(config: Provider, context: IContext): Promise<IPartitionLambda> {
        const documentId = config.get("documentId");
        const tenantId = config.get("tenantId");

        const documentDetails = await DocumentManager.create(tenantId, documentId, this.collection, this.deltas);

        return new RouteMasterLambda(documentDetails, this.producer, context, tenantId, documentId);
    }

    public async dispose(): Promise<void> {
        // TODO shut down any created lambdas and wait for all messages to complete?

        const producerClosedP = this.producer.close();
        const mongoClosedP = this.mongoManager.close();
        await Promise.all([producerClosedP, mongoClosedP]);
    }
}
