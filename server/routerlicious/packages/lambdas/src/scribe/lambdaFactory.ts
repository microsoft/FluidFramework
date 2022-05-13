/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventEmitter } from "events";
import { inspect } from "util";
import {
    ControlMessageType,
    ICollection,
    IContext,
    IControlMessage,
    IDocument,
    ILambdaStartControlMessageContents,
    IPartitionLambda,
    IPartitionLambdaConfig,
    IPartitionLambdaFactory,
    IProducer,
    IScribe,
    ISequencedOperationMessage,
    IServiceConfiguration,
    ITenantManager,
    LambdaName,
    MongoManager,
} from "@fluidframework/server-services-core";
import { IDocumentSystemMessage, ISequencedDocumentMessage, MessageType } from "@fluidframework/protocol-definitions";
import { IGitManager } from "@fluidframework/server-services-client";
import { LumberEventName } from "@fluidframework/server-services-telemetry";
import { NoOpLambda, createSessionMetric } from "../utils";
import { CheckpointManager } from "./checkpointManager";
import { ScribeLambda } from "./lambda";
import { SummaryReader } from "./summaryReader";
import { SummaryWriter } from "./summaryWriter";
import { initializeProtocol, sendToDeli } from "./utils";
import { ILatestSummaryState } from "./interfaces";

const DefaultScribe: IScribe = {
    lastClientSummaryHead: undefined,
    logOffset: -1,
    minimumSequenceNumber: 0,
    protocolState: {
        members: [],
        minimumSequenceNumber: 0,
        proposals: [],
        sequenceNumber: 0,
        values: [],
    },
    sequenceNumber: 0,
    lastSummarySequenceNumber: 0,
};

export class ScribeLambdaFactory extends EventEmitter implements IPartitionLambdaFactory {
    constructor(
        private readonly mongoManager: MongoManager,
        private readonly documentCollection: ICollection<IDocument>,
        private readonly messageCollection: ICollection<ISequencedOperationMessage>,
        private readonly producer: IProducer,
        private readonly tenantManager: ITenantManager,
        private readonly serviceConfiguration: IServiceConfiguration,
        private readonly enableWholeSummaryUpload: boolean,
    ) {
        super();
    }

    public async create(config: IPartitionLambdaConfig, context: IContext): Promise<IPartitionLambda> {
        let document: IDocument;
        let gitManager: IGitManager;
        let lastCheckpoint: IScribe;
        let summaryReader: SummaryReader;
        let latestSummary: ILatestSummaryState;
        let opMessages: ISequencedDocumentMessage[];

        const { tenantId, documentId } = config;
        const messageMetaData = {
            documentId,
            tenantId,
        };

        const scribeSessionMetric = createSessionMetric(tenantId, documentId,
            LumberEventName.ScribeSessionResult, this.serviceConfiguration);

        try {
            const tenant = await this.tenantManager.getTenant(tenantId, documentId);
            gitManager = tenant.gitManager;

            summaryReader = new SummaryReader(tenantId, documentId, gitManager, this.enableWholeSummaryUpload);
            [latestSummary, document] = await Promise.all([
                summaryReader.readLastSummary(),
                this.documentCollection.findOne({ documentId, tenantId }),
            ]);

            // If the document doesn't exist or is marked for deletion then we trivially accept every message
            if (!document || document.scheduledDeletionTime) {
                context.log?.info(`Creating NoOpLambda due to missing document`, { messageMetaData });
                return new NoOpLambda(context);
            }

            // Fetch pending ops from scribeDeltas collection
            const dbMessages =
                await this.messageCollection.find({ documentId, tenantId }, { "operation.sequenceNumber": 1 });
            opMessages = dbMessages.map((message) => message.operation);
        } catch (error) {
            context.log?.error(`Scribe lambda creation failed. Exception: ${inspect(error)}`);
            await this.sendLambdaStartResult(tenantId, documentId, { lambdaName: LambdaName.Scribe, success: false });
            scribeSessionMetric?.error("Scribe lambda creation failed", error);

            throw error;
        }

        // Restore scribe state if not present in the cache. Mongodb casts undefined as null so we are checking
        // both to be safe. Empty sring denotes a cache that was cleared due to a service summary
        if (document.scribe === undefined || document.scribe === null) {
            context.log?.info(`New document. Setting empty scribe checkpoint`, { messageMetaData });
            lastCheckpoint = DefaultScribe;
            opMessages = [];
        } else if (document.scribe === "") {
            context.log?.info(`Existing document. Fetching checkpoint from summary`, { messageMetaData });
            if (!latestSummary.fromSummary) {
                context.log?.error(`Summary can't be fetched`, { messageMetaData });
                lastCheckpoint = DefaultScribe;
                opMessages = [];
            } else {
                lastCheckpoint = JSON.parse(latestSummary.scribe);
                opMessages = latestSummary.messages;
                // Since the document was originated elsewhere or cache was cleared, logOffset info is irrelavant.
                // Currently the lambda checkpoints only after updating the logOffset so setting this to lower
                // is okay. Conceptually this is similar to default checkpoint where logOffset is -1. In this case,
                // the sequence number is 'n' rather than '0'.
                lastCheckpoint.logOffset = -1;
                context.log?.info(JSON.stringify(lastCheckpoint));
            }
        } else {
            lastCheckpoint = JSON.parse(document.scribe);
            context.log?.info(`Restoring checkpoint from db. Seq no: ${lastCheckpoint.sequenceNumber}`);
        }

        // Filter and keep ops after protocol state
        const opsSinceLastSummary = opMessages
            .filter((message) => message.sequenceNumber > lastCheckpoint.protocolState.sequenceNumber);

        let expectedSequenceNumber = lastCheckpoint.protocolState.sequenceNumber + 1;
        for (const message of opsSinceLastSummary) {
            if (message.sequenceNumber !== expectedSequenceNumber) {
                const error = new Error(`Invalid message sequence from checkpoint/summary.`
                    + `Current message @${message.sequenceNumber}.`
                    + `Expected message @${expectedSequenceNumber}`);
                scribeSessionMetric?.error("Invalid message sequence from checkpoint/summary", error);
                await this.sendLambdaStartResult(
                    tenantId,
                    documentId, {
                    lambdaName: LambdaName.Scribe,
                    success: false,
                });

                throw error;
            }
            ++expectedSequenceNumber;
        }

        const protocolHandler = initializeProtocol(lastCheckpoint.protocolState, latestSummary.term);

        const summaryWriter = new SummaryWriter(
            tenantId,
            documentId,
            gitManager,
            this.messageCollection,
            this.enableWholeSummaryUpload);
        const checkpointManager = new CheckpointManager(
            context,
            tenantId,
            documentId,
            this.documentCollection,
            this.messageCollection);

        const scribeLambda = new ScribeLambda(
            context,
            document.tenantId,
            document.documentId,
            summaryWriter,
            summaryReader,
            undefined,
            checkpointManager,
            lastCheckpoint,
            this.serviceConfiguration,
            this.producer,
            protocolHandler,
            latestSummary.term,
            latestSummary.protocolHead,
            opsSinceLastSummary,
            scribeSessionMetric);

        await this.sendLambdaStartResult(tenantId, documentId, { lambdaName: LambdaName.Scribe, success: true });
        return scribeLambda;
    }

    public async dispose(): Promise<void> {
        await this.mongoManager.close();
    }

    private async sendLambdaStartResult(
        tenantId: string,
        documentId: string,
        contents: ILambdaStartControlMessageContents | undefined) {
        const controlMessage: IControlMessage = {
            type: ControlMessageType.LambdaStartResult,
            contents,
        };

        const operation: IDocumentSystemMessage = {
            clientSequenceNumber: -1,
            contents: null,
            data: JSON.stringify(controlMessage),
            referenceSequenceNumber: -1,
            traces: this.serviceConfiguration.enableTraces ? [] : undefined,
            type: MessageType.Control,
        };

        return sendToDeli(tenantId, documentId, this.producer, operation);
    }
}
