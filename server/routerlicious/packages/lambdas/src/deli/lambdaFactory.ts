/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable no-null/no-null */

import { EventEmitter } from "events";
import {
    ICollection,
    IContext,
    IDocument,
    ILogger,
    IPartitionLambda,
    IPartitionLambdaFactory,
    IProducer,
    ITenantManager,
    MongoManager,
} from "@microsoft/fluid-server-services-core";
import { Provider } from "nconf";
import { NoOpLambda } from "../utils";
import { IDeliCheckpoint } from "./checkpointContext";
import { DeliLambda } from "./lambda";
import { migrateSchema } from "./migrateDbObject";

// We expire clients after 5 minutes of no activity
export const ClientSequenceTimeout = 5 * 60 * 1000;

// Timeout for sending no-ops to trigger inactivity checker.
export const ActivityCheckingTimeout = 30 * 1000;

// Timeout for sending consolidated no-ops.
export const NoopConsolidationTimeout = 250;

const DefaultDeliCheckpoint: IDeliCheckpoint = {
    branchMap: undefined,
    clients: undefined,
    logOffset: -1,
    sequenceNumber: 0,
};

export class DeliLambdaFactory extends EventEmitter implements IPartitionLambdaFactory {
    constructor(
        private readonly mongoManager: MongoManager,
        private readonly collection: ICollection<IDocument>,
        private readonly tenantManager: ITenantManager,
        private readonly forwardProducer: IProducer,
        private readonly reverseProducer: IProducer) {
        super();
    }

    public async create(config: Provider, context: IContext): Promise<IPartitionLambda> {
        const documentId = config.get("documentId");
        const tenantId = config.get("tenantId");

        // Lookup the last sequence number stored
        // TODO - is this storage specific to the orderer in place? Or can I generalize the output context?
        const dbObject = await this.collection.findOne({ documentId, tenantId });
        if (!dbObject) {
            // Temporary guard against failure until we figure out what causing this to trigger.
            return new NoOpLambda(context);
        }

        // Migrate the db object to new schema if applicable.
        await migrateSchema(dbObject, this.collection);

        // Restore deli state if not present in the cache. Mongodb casts undefined as null so we are checking
        // both to be safe. Empty sring denotes a cache that was cleared due to a service summary
        if (dbObject.deli === undefined || dbObject.deli === null) {
            context.log.info(`New document. Setting empty deli checkpoint for ${tenantId}/${documentId}`);
            dbObject.deli = JSON.stringify(DefaultDeliCheckpoint);
        } else if (dbObject.deli === "") {
            context.log.info(`Loading deli state from service summary for ${tenantId}/${documentId}`);
            dbObject.deli = await this.loadStateFromSummary(tenantId, documentId, context.log);
        } else {
            context.log.info(`Loading deli state from cache for ${tenantId}/${documentId}`);
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
        await Promise.all([mongoClosedP, forwardProducerClosedP, reverseProducerClosedP]);
    }

    // When deli cache is cleared, we need to hydrate from summary.
    private async loadStateFromSummary(tenantId: string, documentId: string, logger: ILogger): Promise<string> {
        const tenant = await this.tenantManager.getTenant(tenantId);
        const gitManager = tenant.gitManager;

        const existingRef = await gitManager.getRef(encodeURIComponent(documentId));

        // We should fail when no service summary is present. For now we are just logging it for better telemetry.
        if (!existingRef) {
            logger.error(`No service summary present for ${tenantId}/${documentId}`);
            return JSON.stringify(DefaultDeliCheckpoint);
        } else {
            try {
                const content = await gitManager.getContent(existingRef.object.sha, ".serviceProtocol/deli");
                const deliState = Buffer.from(content.content, content.encoding).toString();
                return deliState;
            } catch (exception) {
                logger.error(`Error fetching deli state from summary: ${tenantId}/${documentId}`);
                logger.error(JSON.stringify(exception));
                return JSON.stringify(DefaultDeliCheckpoint);
            }
        }
    }
}
