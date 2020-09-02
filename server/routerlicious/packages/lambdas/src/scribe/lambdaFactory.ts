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
    IPartitionLambda,
    IPartitionLambdaFactory,
    IProducer,
    IScribe,
    ISequencedOperationMessage,
    ITenantManager,
    MongoManager,
} from "@fluidframework/server-services-core";
import { Provider } from "nconf";
import { NoOpLambda } from "../utils";
import { CheckpointManager } from "./checkpointManager";
import { ScribeLambda } from "./lambda";
import { SummaryReader } from "./summaryReader";
import { SummaryWriter } from "./summaryWriter";
import { initializeProtocol } from "./utils";

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
};

export class ScribeLambdaFactory extends EventEmitter implements IPartitionLambdaFactory {
    constructor(
        private readonly mongoManager: MongoManager,
        private readonly documentCollection: ICollection<IDocument>,
        private readonly messageCollection: ICollection<ISequencedOperationMessage>,
        private readonly producer: IProducer,
        private readonly tenantManager: ITenantManager,
    ) {
        super();
    }

    public async create(config: Provider, context: IContext): Promise<IPartitionLambda> {
        const tenantId: string = config.get("tenantId");
        const documentId: string = config.get("documentId");

        const tenant = await this.tenantManager.getTenant(tenantId);
        const gitManager = tenant.gitManager;

        const summaryReader = new SummaryReader(documentId, gitManager);
        const [latestSummary, document] = await Promise.all([
            summaryReader.readLastSummary(),
            this.documentCollection.findOne({ documentId, tenantId }),
        ]);

        const messageMetaData = {
            documentId,
            tenantId,
        };
        // If the document doesn't exist then we trivially accept every message
        if (!document) {
            context.log.info(`Creating NoOpLambda due to missing`, { messageMetaData });
            return new NoOpLambda(context);
        }

        const dbMessages =
            await this.messageCollection.find({ documentId, tenantId }, { "operation.sequenceNumber": 1 });
        let opMessages = dbMessages.map((message) => message.operation);

        let lastCheckpoint: IScribe;

        // Restore scribe state if not present in the cache. Mongodb casts undefined as null so we are checking
        // both to be safe. Empty sring denotes a cache that was cleared due to a service summary
        if (document.scribe === undefined || document.scribe === null) {
            context.log.info(`New document. Setting empty scribe checkpoint`, { messageMetaData });
            lastCheckpoint = DefaultScribe;
            opMessages = [];
        } else if (document.scribe === "") {
            context.log.info(`Existing document. Fetching checkpoint from summary`, { messageMetaData });
            if (!latestSummary.fromSummary) {
                context.log.error(`Summary can't be fetched`, { messageMetaData });
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
                context.log.info(JSON.stringify(lastCheckpoint));
            }
        } else {
            lastCheckpoint = JSON.parse(document.scribe);
        }

        const protocolHandler = initializeProtocol(
            document.documentId,
            lastCheckpoint.protocolState,
            latestSummary.term);

        const summaryWriter = new SummaryWriter(tenantId, documentId, gitManager, this.messageCollection);
        const checkpointManager = new CheckpointManager(
            tenantId,
            documentId,
            this.documentCollection,
            this.messageCollection);

        return new ScribeLambda(
            context,
            document.tenantId,
            document.documentId,
            summaryWriter,
            summaryReader,
            checkpointManager,
            lastCheckpoint,
            this.producer,
            protocolHandler,
            latestSummary.term,
            latestSummary.protocolHead,
            opMessages,
            true,
            false);
    }

    public async dispose(): Promise<void> {
        await this.mongoManager.close();
    }
}
