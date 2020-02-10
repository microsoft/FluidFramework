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
} from "@microsoft/fluid-server-services-core";
import { Provider } from "nconf";
import * as winston from "winston";
import { NoOpLambda } from "../utils";
import { ScribeLambda } from "./lambda";

const DefaultScribe: IScribe = {
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

        winston.info(`New tenant storage ${tenantId}/${documentId}`);
        const tenant = await this.tenantManager.getTenant(tenantId);
        const gitManager = tenant.gitManager;

        winston.info(`Querying mongo for proposals ${tenantId}/${documentId}`);
        const [protocolHead, document, messages] = await Promise.all([
            this.fetchLatestSummaryState(gitManager, documentId),
            this.documentCollection.findOne({ documentId, tenantId }),
            this.messageCollection.find({ documentId, tenantId }, { "operation.sequenceNumber": 1 }),
        ]);

        // If the document doesn't exist then we trivially accept every message
        if (!document) {
            winston.info(`Creating NoOpLambda due to missing ${tenantId}/${documentId}`);
            return new NoOpLambda(context);
        }

        // Check of scribe being a non-string included for back compat when we would store as JSON. We now store
        // as a string given Mongo has issues with certain JSON values. Will be removed in 0.8.
        const scribe: IScribe = document.scribe
            ? typeof document.scribe === "string" ? JSON.parse(document.scribe) : document.scribe
            : DefaultScribe;
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

        winston.info(`Proposals ${tenantId}/${documentId}: ${JSON.stringify(document)}`);

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
            messages);
    }

    public async dispose(): Promise<void> {
        await this.mongoManager.close();
    }

    private async fetchLatestSummaryState(gitManager: IGitManager, documentId: string): Promise<number> {
        const existingRef = await gitManager.getRef(encodeURIComponent(documentId));
        if (!existingRef) {
            return -1;
        }

        try {
            const content = await gitManager.getContent(existingRef.object.sha, ".protocol/attributes");
            const attributes =
                JSON.parse(Buffer.from(content.content, content.encoding).toString()) as IDocumentAttributes;

            winston.info(`Attributes ${JSON.stringify(attributes)}`);
            return attributes.sequenceNumber;
        } catch (exception) {
            return 0;
        }
    }
}
