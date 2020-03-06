/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventEmitter } from "events";
import { ProtocolOpHandler } from "@microsoft/fluid-protocol-base";
import { IDocumentAttributes } from "@microsoft/fluid-protocol-definitions";
import { IGitManager } from "@microsoft/fluid-server-services-client";
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
    ILogger,
} from "@microsoft/fluid-server-services-core";
import { Provider } from "nconf";
import { NoOpLambda } from "../utils";
import { ScribeLambda } from "./lambda";

const DefaultScribe: IScribe = {
    lastClientSummaryHead: undefined,
    logOffset: -1,
    minimumSequenceNumber: 0,
    protocolState: undefined,
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
        const tenantId = config.get("tenantId");
        const documentId = config.get("documentId");

        context.log.info(`New tenant storage ${tenantId}/${documentId}`);
        const tenant = await this.tenantManager.getTenant(tenantId);
        const gitManager = tenant.gitManager;

        context.log.info(`Querying mongo for proposals ${tenantId}/${documentId}`);
        const [protocolHead, document, messages] = await Promise.all([
            this.fetchLatestSummaryState(gitManager, documentId, context.log),
            this.documentCollection.findOne({ documentId, tenantId }),
            this.messageCollection.find({ documentId, tenantId }, { "operation.sequenceNumber": 1 }),
        ]);

        // If the document doesn't exist then we trivially accept every message
        if (!document) {
            context.log.info(`Creating NoOpLambda due to missing ${tenantId}/${documentId}`);
            return new NoOpLambda(context);
        }

        const scribe: IScribe = document.scribe ? JSON.parse(document.scribe) : DefaultScribe;

        if (!scribe.protocolState) {
            scribe.protocolState = {
                members: [],
                minimumSequenceNumber: 0,
                proposals: [],
                sequenceNumber: 0,
                values: [],
            };
        }

        const protocolHandler = new ProtocolOpHandler(
            document.documentId,
            scribe.protocolState.minimumSequenceNumber,
            scribe.protocolState.sequenceNumber,
            scribe.protocolState.members,
            scribe.protocolState.proposals,
            scribe.protocolState.values,
            () => -1,
            () => { return; },
        );

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
            protocolHead,
            messages,
            true);
    }

    public async dispose(): Promise<void> {
        await this.mongoManager.close();
    }

    private async fetchLatestSummaryState(
        gitManager: IGitManager,
        documentId: string,
        logger: ILogger): Promise<number> {
        const existingRef = await gitManager.getRef(encodeURIComponent(documentId));
        if (!existingRef) {
            return 0;
        }

        try {
            const content = await gitManager.getContent(existingRef.object.sha, ".protocol/attributes");
            const attributes =
                JSON.parse(Buffer.from(content.content, content.encoding).toString()) as IDocumentAttributes;

            logger.info(`Attributes ${JSON.stringify(attributes)}`);
            return attributes.sequenceNumber;
        } catch (exception) {
            return 0;
        }
    }
}
