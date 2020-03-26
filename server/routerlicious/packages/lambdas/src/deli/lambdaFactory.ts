/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

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

const getDefaultCheckpooint = (epoch: number): IDeliCheckpoint => {
    return {
        branchMap: undefined,
        clients: undefined,
        durableSequenceNumber: 0,
        epoch,
        logOffset: -1,
        sequenceNumber: 0,
        term: 1,
    };
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
        const leaderEpoch = config.get("leaderEpoch") as number;

        // Lookup the last sequence number stored
        // TODO - is this storage specific to the orderer in place? Or can I generalize the output context?
        let dbObject = await this.collection.findOne({ documentId, tenantId });
        if (!dbObject) {
            // Temporary guard against failure until we figure out what causing this to trigger.
            return new NoOpLambda(context);
        }

        // Migrate the db object to new schema if applicable.
        dbObject = await migrateSchema(dbObject, this.collection, leaderEpoch, 1);

        let lastCheckpoint: IDeliCheckpoint;

        // Restore deli state if not present in the cache. Mongodb casts undefined as null so we are checking
        // both to be safe. Empty sring denotes a cache that was cleared due to a service summary
        // eslint-disable-next-line no-null/no-null
        if (dbObject.deli === undefined || dbObject.deli === null) {
            context.log.info(`New document. Setting empty deli checkpoint for ${tenantId}/${documentId}`);
            lastCheckpoint = getDefaultCheckpooint(leaderEpoch);
        } else {
            lastCheckpoint = dbObject.deli === "" ?
                await this.loadStateFromSummary(tenantId, documentId, leaderEpoch, context.log) :
                JSON.parse(dbObject.deli);

            if (lastCheckpoint.epoch !== undefined && lastCheckpoint.term !== undefined) {
                // Increment term if epoch changed since the last checkpoint. Epoch should always move forward
                // but there is no need to enforce it.
                if (leaderEpoch !== lastCheckpoint.epoch) {
                    ++lastCheckpoint.term;
                    lastCheckpoint.epoch = leaderEpoch;
                }
            } else {
                // Back-compat for old documents.
                lastCheckpoint.epoch = leaderEpoch;
                lastCheckpoint.term = 1;
                lastCheckpoint.durableSequenceNumber = lastCheckpoint.sequenceNumber;
            }
        }

        // Should the lambda reaize that term has flipped to send a no-op message at the beginning?
        return new DeliLambda(
            context,
            tenantId,
            documentId,
            lastCheckpoint,
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
    private async loadStateFromSummary(
        tenantId: string,
        documentId: string,
        leaderEpoch: number,
        logger: ILogger): Promise<IDeliCheckpoint> {
        const tenant = await this.tenantManager.getTenant(tenantId);
        const gitManager = tenant.gitManager;

        const existingRef = await gitManager.getRef(encodeURIComponent(documentId));

        if (!existingRef) {
            logger.error(`No service summary present for ${tenantId}/${documentId}`);
            return getDefaultCheckpooint(leaderEpoch);
        } else {
            try {
                const content = await gitManager.getContent(existingRef.object.sha, ".serviceProtocol/deli");
                return JSON.parse(Buffer.from(content.content, content.encoding).toString()) as IDeliCheckpoint;
            } catch (exception) {
                // We should really fail when no service summary is present.
                // For now we are just logging it for better telemetry.
                logger.error(`Error fetching deli state from summary: ${tenantId}/${documentId}`);
                logger.error(JSON.stringify(exception));
                return getDefaultCheckpooint(leaderEpoch);
            }
        }
    }
}
