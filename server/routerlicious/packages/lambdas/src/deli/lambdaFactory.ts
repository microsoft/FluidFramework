/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventEmitter } from "events";
import { inspect } from "util";
import { toUtf8 } from "@fluidframework/common-utils";
import { ICreateCommitParams, ICreateTreeEntry } from "@fluidframework/gitresources";
import {
    IClientManager,
    ICollection,
    IContext,
    IDeliState,
    IDocument,
    ILogger,
    IPartitionLambda,
    IPartitionLambdaConfig,
    IPartitionLambdaFactory,
    IProducer,
    IServiceConfiguration,
    ITenantManager,
    LambdaCloseType,
    MongoManager,
} from "@fluidframework/server-services-core";
import { generateServiceProtocolEntries } from "@fluidframework/protocol-base";
import { FileMode } from "@fluidframework/protocol-definitions";
import { defaultHash, IGitManager } from "@fluidframework/server-services-client";
import { Lumber, LumberEventName } from "@fluidframework/server-services-telemetry";
import { NoOpLambda, createSessionMetric } from "../utils";
import { DeliLambda } from "./lambda";
import { createDeliCheckpointManagerFromCollection } from "./checkpointManager";

// Epoch should never tick in our current setting. This flag is just for being extra cautious.
// TODO: Remove when everything is up to date.
const FlipTerm = false;

const getDefaultCheckpooint = (epoch: number): IDeliState => {
    return {
        clients: undefined,
        durableSequenceNumber: 0,
        epoch,
        expHash1: defaultHash,
        logOffset: -1,
        sequenceNumber: 0,
        signalClientConnectionNumber: 0,
        term: 1,
        lastSentMSN: 0,
        nackMessages: undefined,
        successfullyStartedLambdas: [],
    };
};

export class DeliLambdaFactory extends EventEmitter implements IPartitionLambdaFactory {
    constructor(
        private readonly operationsDbMongoManager: MongoManager,
        private readonly collection: ICollection<IDocument>,
        private readonly tenantManager: ITenantManager,
        private readonly clientManager: IClientManager | undefined,
        private readonly forwardProducer: IProducer,
        private readonly signalProducer: IProducer | undefined,
        private readonly reverseProducer: IProducer,
        private readonly serviceConfiguration: IServiceConfiguration) {
        super();
    }

    public async create(config: IPartitionLambdaConfig, context: IContext): Promise<IPartitionLambda> {
        const { documentId, tenantId, leaderEpoch } = config;
        const sessionMetric = createSessionMetric(tenantId, documentId,
            LumberEventName.SessionResult, this.serviceConfiguration);
        const sessionStartMetric = createSessionMetric(tenantId, documentId,
            LumberEventName.StartSessionResult, this.serviceConfiguration);

        const messageMetaData = {
            documentId,
            tenantId,
        };

        let gitManager: IGitManager;
        let dbObject: IDocument;

        try {
            const tenant = await this.tenantManager.getTenant(tenantId, documentId);
            gitManager = tenant.gitManager;

            // Lookup the last sequence number stored
            // TODO - is this storage specific to the orderer in place? Or can I generalize the output context?
            dbObject = await this.collection.findOne({ documentId, tenantId });
            // Check if the document was deleted prior.
        } catch (error) {
            const errMsg = "Deli lambda creation failed";
            context.log?.error(`${errMsg}. Exception: ${inspect(error)}`, { messageMetaData });
            this.logSessionFailureMetrics(sessionMetric, sessionStartMetric, errMsg);
            throw error;
        }

        if (!dbObject || dbObject.scheduledDeletionTime) {
            // Temporary guard against failure until we figure out what causing this to trigger.
            return new NoOpLambda(context);
        }

        let lastCheckpoint: IDeliState;

        // Restore deli state if not present in the cache. Mongodb casts undefined as null so we are checking
        // both to be safe. Empty sring denotes a cache that was cleared due to a service summary or the document
        // was created within a different tenant.
        if (dbObject.deli === undefined || dbObject.deli === null) {
            context.log?.info(`New document. Setting empty deli checkpoint`, { messageMetaData });
            lastCheckpoint = getDefaultCheckpooint(leaderEpoch);
        } else {
            if (dbObject.deli === "") {
                context.log?.info(`Existing document. Fetching checkpoint from summary`, { messageMetaData });

                const lastCheckpointFromSummary =
                    await this.loadStateFromSummary(tenantId, documentId, gitManager, context.log);
                if (lastCheckpointFromSummary === undefined) {
                    const errMsg = "Could not load state from summary";
                    context.log?.error(errMsg, { messageMetaData });
                    this.logSessionFailureMetrics(sessionMetric, sessionStartMetric, errMsg);

                    lastCheckpoint = getDefaultCheckpooint(leaderEpoch);
                } else {
                    lastCheckpoint = lastCheckpointFromSummary;
                    // Since the document was originated elsewhere or cache was cleared, logOffset info is irrelavant.
                    // Currently the lambda checkpoints only after updating the logOffset so setting this to lower
                    // is okay. Conceptually this is similar to default checkpoint where logOffset is -1. In this case,
                    // the sequence number is 'n' rather than '0'.
                    lastCheckpoint.logOffset = -1;
                    lastCheckpoint.epoch = leaderEpoch;
                    context.log?.info(`Deli checkpoint from summary:
                        ${JSON.stringify(lastCheckpoint)}`, { messageMetaData });
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

        const checkpointManager = createDeliCheckpointManagerFromCollection(tenantId, documentId, this.collection);

        // Should the lambda reaize that term has flipped to send a no-op message at the beginning?
        const deliLambda = new DeliLambda(
            context,
            tenantId,
            documentId,
            newCheckpoint,
            checkpointManager,
            this.clientManager,
            // The producer as well it shouldn't take. Maybe it just gives an output stream?
            this.forwardProducer,
            this.signalProducer,
            this.reverseProducer,
            this.serviceConfiguration,
            sessionMetric,
            sessionStartMetric);

        deliLambda.on("close", (closeType) => {
            const handler = async () => {
                if ((closeType === LambdaCloseType.ActivityTimeout || closeType === LambdaCloseType.Error)) {
                    const query = { documentId, tenantId, session: { $exists: true } };
                    const data = { "session.isSessionAlive": false };
                    await this.collection.update(query, data, null);
                    context.log?.info(`Marked isSessionAlive as false for closeType: ${JSON.stringify(closeType)}`,
                        { messageMetaData });
                }
            };
            handler().catch((e) => {
                context.log?.error(`Failed to handle isSessionAlive with exception ${e}`
                    , { messageMetaData });
            });
        });

        return deliLambda;
    }

    private logSessionFailureMetrics(
        sessionMetric: Lumber<LumberEventName.SessionResult> | undefined,
        sessionStartMetric: Lumber<LumberEventName.StartSessionResult> | undefined,
        errMsg: string) {
        sessionMetric?.error(errMsg);
        sessionStartMetric?.error(errMsg);
    }

    public async dispose(): Promise<void> {
        const mongoClosedP = this.operationsDbMongoManager.close();
        const forwardProducerClosedP = this.forwardProducer.close();
        const signalProducerClosedP = this.signalProducer?.close();
        const reverseProducerClosedP = this.reverseProducer.close();
        await Promise.all([mongoClosedP, forwardProducerClosedP, signalProducerClosedP, reverseProducerClosedP]);
    }

    // Fetches last durable deli state from summary. Returns undefined if not present.
    private async loadStateFromSummary(
        tenantId: string,
        documentId: string,
        gitManager: IGitManager,
        logger: ILogger | undefined): Promise<IDeliState | undefined> {
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
                logger?.error(`Error fetching deli state from summary`, { messageMetaData });
                logger?.error(JSON.stringify(exception), { messageMetaData });
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
        logger: ILogger | undefined,
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
                logger?.info(
                    `Created a summary on epoch tick`,
                    {
                        messageMetaData: {
                            documentId,
                            tenantId,
                        },
                    });
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
            gitManager.createTree({ entries: serviceProtocolEntries }),
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
