/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventEmitter } from "events";
import { toUtf8 } from "@fluidframework/common-utils";
import { ICreateCommitParams, ICreateTreeEntry } from "@fluidframework/gitresources";
import {
    ICollection,
    IContext,
    IDeliState,
    IDocument,
    ILogger,
    IPartitionLambda,
    IPartitionLambdaFactory,
    IProducer,
    ITenantManager,
    MongoManager,
} from "@fluidframework/server-services-core";
import { generateServiceProtocolEntries } from "@fluidframework/protocol-base";
import { FileMode } from "@fluidframework/protocol-definitions";
import { IGitManager } from "@fluidframework/server-services-client";
import { Provider } from "nconf";
import { NoOpLambda } from "../utils";
import { DeliLambda } from "./lambda";

// We expire clients after 5 minutes of no activity
export const ClientSequenceTimeout = 5 * 60 * 1000;

// Timeout for sending no-ops to trigger inactivity checker.
export const ActivityCheckingTimeout = 30 * 1000;

// Timeout for sending consolidated no-ops.
export const NoopConsolidationTimeout = 250;

// Epoch should never tick in our current setting. This flag is just for being extra cautious.
// TODO: Remove when everything is up to date.
const FlipTerm = false;

const getDefaultCheckpooint = (epoch: number): IDeliState => {
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

        const tenant = await this.tenantManager.getTenant(tenantId);
        const gitManager = tenant.gitManager;

        // Lookup the last sequence number stored
        // TODO - is this storage specific to the orderer in place? Or can I generalize the output context?
        const dbObject = await this.collection.findOne({ documentId, tenantId });
        if (!dbObject) {
            // Temporary guard against failure until we figure out what causing this to trigger.
            return new NoOpLambda(context);
        }

        let lastCheckpoint: IDeliState;

        const messageMetaData = {
            documentId,
            tenantId,
        };

        // Restore deli state if not present in the cache. Mongodb casts undefined as null so we are checking
        // both to be safe. Empty sring denotes a cache that was cleared due to a service summary or the document
        // was created within a different tenant.
        // eslint-disable-next-line no-null/no-null
        if (dbObject.deli === undefined || dbObject.deli === null) {
            context.log.info(`New document. Setting empty deli checkpoint`, { messageMetaData });
            lastCheckpoint = getDefaultCheckpooint(leaderEpoch);
        } else {
            if (dbObject.deli === "") {
                context.log.info(`Existing document. Fetching checkpoint from summary`, { messageMetaData });

                lastCheckpoint = await this.loadStateFromSummary(tenantId, documentId, gitManager, context.log);
                if (lastCheckpoint === undefined) {
                    context.log.error(`Summary cannot be fetched`, { messageMetaData });
                    lastCheckpoint = getDefaultCheckpooint(leaderEpoch);
                } else {
                    // Since the document was originated elsewhere or cache was cleared, logOffset info is irrelavant.
                    // Currently the lambda checkpoints only after updating the logOffset so setting this to lower
                    // is okay. Conceptually this is similar to default checkpoint where logOffset is -1. In this case,
                    // the sequence number is 'n' rather than '0'.
                    lastCheckpoint.logOffset = -1;
                    lastCheckpoint.epoch = leaderEpoch;
                    context.log.info(JSON.stringify(lastCheckpoint));
                }
            } else {
                lastCheckpoint = JSON.parse(dbObject.deli);
            }
        }

        // For cases such as detached container where the document was generated outside the scope of deli
        // and checkpoint was written manually.
        if (lastCheckpoint.epoch === undefined) {
            lastCheckpoint.epoch = leaderEpoch;
            lastCheckpoint.term = 1;
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

    // Fetches last durable deli state from summary. Returns undefined if not present.
    private async loadStateFromSummary(
        tenantId: string,
        documentId: string,
        gitManager: IGitManager,
        logger: ILogger): Promise<IDeliState> {
        const existingRef = await gitManager.getRef(encodeURIComponent(documentId));
        if (existingRef) {
            try {
                const content = await gitManager.getContent(existingRef.object.sha, ".serviceProtocol/deli");
                const summaryCheckpoint = JSON.parse(toUtf8(content.content, content.encoding)) as IDeliState;
                return summaryCheckpoint;
            } catch (exception) {
                const messageMetaData = {
                    documentId,
                    tenantId,
                };
                logger.error(`Error fetching deli state from summary`, { messageMetaData });
                logger.error(JSON.stringify(exception), { messageMetaData });
                return undefined;
            }
        }
    }

    // Check the current epoch with last epoch. If not matched, we need to flip the term.
    // However, we need to store the current term and epoch reliably before we kick off the lambda.
    // Hence we need to create another summary. Logically its an update but in a git sense,
    // its a new commit in the chain.

    // Another aspect is the starting summary. What happens when epoch ticks and we never had a prior summary?
    // For now we are just skipping the step if no prior summary was present.
    // TODO: May be alfred/deli should create a summary at inception?
    private async resetCheckpointOnEpochTick(
        tenantId: string,
        documentId: string,
        gitManager: IGitManager,
        logger: ILogger,
        checkpoint: IDeliState,
        leaderEpoch: number): Promise<IDeliState> {
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
                const messageMetaData = {
                    documentId,
                    tenantId,
                };
                logger.info(`Created a summary on epoch tick`, { messageMetaData });
            }
        }
        return newCheckpoint;
    }

    private async createSummaryWithLatestTerm(
        gitManager: IGitManager,
        checkpoint: IDeliState,
        documentId: string) {
        const existingRef = await gitManager.getRef(encodeURIComponent(documentId));
        const [lastCommit, scribeContent] = await Promise.all([
            gitManager.getCommit(existingRef.object.sha),
            gitManager.getContent(existingRef.object.sha, ".serviceProtocol/scribe")]);

        const scribe = toUtf8(scribeContent.content, scribeContent.encoding);
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
