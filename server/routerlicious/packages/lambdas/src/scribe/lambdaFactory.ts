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
import { ScribeLambda } from "./lambda";
import { fetchLatestSummaryState, initializeProtocol } from "./summaryHelper";

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

        const [latestSummary, document] = await Promise.all([
            fetchLatestSummaryState(gitManager, documentId),
            this.documentCollection.findOne({ documentId, tenantId }),
        ]);

        // If the document doesn't exist then we trivially accept every message
        if (!document) {
            context.log.info(`Creating NoOpLambda due to missing ${tenantId}/${documentId}`);
            return new NoOpLambda(context);
        }

        const dbMessages =
            await this.messageCollection.find({ documentId, tenantId }, { "operation.sequenceNumber": 1 });
        let opMessages = dbMessages.map((message) => message.operation);

        // Restore scribe state if not present in the cache. Mongodb casts undefined as null so we are checking
        // both to be safe. Empty sring denotes a cache that was cleared due to a service summary
        if (document.scribe === undefined || document.scribe === null) {
            context.log.info(`New document. Setting empty scribe checkpoint for ${tenantId}/${documentId}`);
            document.scribe = JSON.stringify(DefaultScribe);
        } else if (document.scribe === "") {
            if (!latestSummary.fromSummary) {
                throw Error(`Required summary can't be fetched for ${tenantId}/${documentId}`);
            }
            context.log.info(`Loading scribe state from service summary for ${tenantId}/${documentId}`);
            document.scribe = latestSummary.scribe;
            opMessages = latestSummary.messages;
        } else {
            context.log.info(`Loading scribe state from cache for ${tenantId}/${documentId}`);
        }

        const term = latestSummary.fromSummary ? latestSummary.term : 1;
        const scribe: IScribe = JSON.parse(document.scribe);
        const protocolHandler = initializeProtocol(document.documentId, scribe, term);

        return new ScribeLambda(
            context,
            this.documentCollection,
            this.messageCollection,
            document.tenantId,
            document.documentId,
            scribe,
            gitManager,
            this.producer,
            protocolHandler,
            latestSummary.term,
            latestSummary.protocolHead,
            opMessages,
            true);
    }

    public async dispose(): Promise<void> {
        await this.mongoManager.close();
    }
}
