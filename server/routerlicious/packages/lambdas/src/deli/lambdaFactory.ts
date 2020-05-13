/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventEmitter } from "events";
import { ICreateCommitParams, ICreateTreeEntry, IRef } from "@microsoft/fluid-gitresources";
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
import { generateServiceProtocolEntries } from "@microsoft/fluid-protocol-base";
import { FileMode } from "@microsoft/fluid-protocol-definitions";
import { IGitManager } from "@microsoft/fluid-server-services-client";
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

// Epoch should never tick in our current setting. This flag is just for being extra cautious.
// TODO: Remove when everything is up to date.
const FlipTerm = false;

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

    // Cache for ref and last summary checkpoint.
    private existingRef: IRef;
    private summaryCheckpoint: IDeliCheckpoint;

    public async create(config: Provider, context: IContext): Promise<IPartitionLambda> {
        const documentId = config.get("documentId");
        const tenantId = config.get("tenantId");
        const leaderEpoch = config.get("leaderEpoch") as number;

        const tenant = await this.tenantManager.getTenant(tenantId);
        const gitManager = tenant.gitManager;

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
            if (dbObject.deli === "") {
                lastCheckpoint = await this.loadStateFromSummary(tenantId, documentId, gitManager, context.log);
                if (lastCheckpoint === undefined) {
                    throw Error("Summary cannot be fetched");
                }
            } else {
                lastCheckpoint = JSON.parse(dbObject.deli);
            }
        }

        // back-compat for older documents.
        if (lastCheckpoint.epoch === undefined) {
            lastCheckpoint.epoch = leaderEpoch;
            lastCheckpoint.term = 1;
            lastCheckpoint.durableSequenceNumber = lastCheckpoint.sequenceNumber;
        }

        const newCheckpoint = FlipTerm ?
            await this.resetCheckpointOnEpochTick(
                tenantId,
                documentId,
                gitManager,
                context.log,
                lastCheckpoint,
                leaderEpoch,
            ) :
            lastCheckpoint;

        // Should the lambda reaize that term has flipped to send a no-op message at the beginning?
        return new DeliLambda(
            context,
            tenantId,
            documentId,
            newCheckpoint,
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

    // Fetches last durable deli state from summary. Returns undefined if not present or on an error.
    private async loadStateFromSummary(
        tenantId: string,
        documentId: string,
        gitManager: IGitManager,
        logger: ILogger): Promise<IDeliCheckpoint> {
        if (this.summaryCheckpoint === undefined) {
            this.existingRef = await gitManager.getRef(encodeURIComponent(documentId));
            if (this.existingRef) {
                try {
                    const content = await gitManager.getContent(this.existingRef.object.sha, ".serviceProtocol/deli");
                    this.summaryCheckpoint = JSON.parse(
                        Buffer.from(content.content, content.encoding).toString()) as IDeliCheckpoint;
                } catch (exception) {
                    logger.error(`Error fetching deli state from summary: ${tenantId}/${documentId}`);
                    logger.error(JSON.stringify(exception));
                    return undefined;
                }
            }
        }
        return this.summaryCheckpoint;
    }

    // Check the current epoch with last epoch. If not matched, we need to flip the term.
    // However, we need to store the current term and epoch reliably before we kick off the lambda.
    // Hence we need to create another summary. Logically its an overwrite but in a git sense,
    // its a new commit. I am wondering whether we should have an updateSummary() in the driver
    // to hide these amongst storage providers?

    // Another aspect is the starting summary. What happens when epoch ticks and we never had a prior summary?
    // Creating a summary for every new document seems wasteful? For now, I am checking whether we had a
    // summary before flipping the term. When we move to createNew() for creation, this should not be a
    // problem anymore.
    private async resetCheckpointOnEpochTick(
        tenantId: string,
        documentId: string,
        gitManager: IGitManager,
        logger: ILogger,
        checkpoint: IDeliCheckpoint,
        leaderEpoch: number): Promise<IDeliCheckpoint> {
        let newCheckpoint = checkpoint;
        if (leaderEpoch !== newCheckpoint.epoch) {
            const lastSummaryState = await this.loadStateFromSummary(tenantId, documentId, gitManager, logger);
            if (lastSummaryState === undefined) {
                newCheckpoint.epoch = leaderEpoch;
            } else {
                // Log offset should never move backwards.
                const logOffset = newCheckpoint.logOffset;
                newCheckpoint = lastSummaryState;
                newCheckpoint.epoch = leaderEpoch;
                ++newCheckpoint.term;
                newCheckpoint.durableSequenceNumber = lastSummaryState.sequenceNumber;
                newCheckpoint.logOffset = logOffset;
                // Now create the summary.
                await this.createSummaryWithLatestTerm(gitManager, newCheckpoint, documentId);
                logger.info(`Created a summary on epoch tick`);
            }
        }
        return newCheckpoint;
    }

    private async createSummaryWithLatestTerm(
        gitManager: IGitManager,
        checkpoint: IDeliCheckpoint,
        documentId: string) {
        const [lastCommit, scribeContent] = await Promise.all([
            gitManager.getCommit(this.existingRef.object.sha),
            gitManager.getContent(this.existingRef.object.sha, ".serviceProtocol/scribe")]);

        const scribe = Buffer.from(scribeContent.content, scribeContent.encoding).toString();
        const serviceProtocolEntries = generateServiceProtocolEntries(JSON.stringify(checkpoint), scribe);

        const [serviceProtocolTree, lastSummaryTree] = await Promise.all([
            // eslint-disable-next-line no-null/no-null
            gitManager.createTree({ entries: serviceProtocolEntries, id: null }),
            gitManager.getTree(lastCommit.tree.sha, false),
        ]);

        const newTreeEntries = lastSummaryTree.tree
            .filter((value) => value.path !== ".serviceProtocol")
            .map((value) => {
                const createTreeEntry: ICreateTreeEntry = {
                    mode: value.mode,
                    path: value.path,
                    sha: value.sha,
                    type: value.type,
                };
                return createTreeEntry;
            });

        newTreeEntries.push({
            mode: FileMode.Directory,
            path: ".serviceProtocol",
            sha: serviceProtocolTree.sha,
            type: "tree",
        });

        const gitTree = await gitManager.createGitTree({ tree: newTreeEntries });
        const commitParams: ICreateCommitParams = {
            author: {
                date: new Date().toISOString(),
                email: "praguertdev@microsoft.com",
                name: "Routerlicious Service",
            },
            message: `Term Change Summary @T${checkpoint.term}S${checkpoint.sequenceNumber}`,
            parents: [lastCommit.sha],
            tree: gitTree.sha,
        };

        // Finally commit the summary and update the ref.
        const commit = await gitManager.createCommit(commitParams);
        await gitManager.upsertRef(documentId, commit.sha);
    }
}
