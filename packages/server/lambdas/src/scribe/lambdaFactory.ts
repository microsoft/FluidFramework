/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { GitManager, Historian } from "@microsoft/fluid-server-services-client";
import {
    ICollection,
    IContext,
    IDocument,
    IPartitionLambda,
    IPartitionLambdaFactory,
    IProducer,
    IScribe,
    ISequencedOperationMessage,
    MongoManager,
} from "@microsoft/fluid-server-services-core";
import { ProtocolOpHandler } from "@prague/container-loader";
import { IDocumentAttributes } from "@prague/protocol-definitions";
import { EventEmitter } from "events";
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
        private mongoManager: MongoManager,
        private documentCollection: ICollection<IDocument>,
        private messageCollection: ICollection<ISequencedOperationMessage>,
        private historianEndpoint: string,
        private producer: IProducer,
    ) {
        super();
    }

    public async create(config: Provider, context: IContext): Promise<IPartitionLambda> {
        const tenantId = config.get("tenantId");
        const documentId = config.get("documentId");

        winston.info(`New tenant storage ${tenantId}/${documentId}`);
        const endpoint = `${this.historianEndpoint}/repos/${encodeURIComponent(tenantId)}`;
        const historian = new Historian(endpoint, true, false);
        const gitManager = new GitManager(historian);

        winston.info(`Querying mongo for proposals ${tenantId}/${documentId}`);
        const [protocolHead, document, messages] = await Promise.all([
            this.fetchLatestSummaryState(gitManager, documentId),
            this.documentCollection.findOne({ documentId, tenantId }),
            this.messageCollection.find({ documentId, tenantId }, { "operation.sequenceNumber": 1}),
        ]);

        // If the document doesn't exist then we trivially accept every message
        if (!document) {
            winston.info(`Creating NoOpLambda due to missing ${tenantId}/${documentId}`);
            return new NoOpLambda(context);
        }

        // Check of scribe being a non-string included for back compat when we would store as JSON. We now store
        // as a string given Mongo has issues with certain JSON values. Will be removed in 0.8.
        const scribe = document.scribe
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

    private async fetchLatestSummaryState(gitManager: GitManager, documentId: string): Promise<number> {
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
