/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IDocumentAttributes } from "@prague/container-definitions";
import { ProtocolOpHandler } from "@prague/container-loader";
import { GitManager, Historian } from "@prague/services-client";
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
} from "@prague/services-core";
import { EventEmitter } from "events";
import { Provider } from "nconf";
import * as winston from "winston";
import { ScribeLambda } from "./lambda";

const DefaultScribe: IScribe = {
    logOffset: -1,
    minimumSequenceNumber: -1,
    protocolState: undefined,
    sequenceNumber: -1,
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

        const scribe = document.scribe ? document.scribe : DefaultScribe;
        const lastState = scribe.protocolState
            ? scribe.protocolState
            : { members: [], proposals: [], values: []};

        const protocolHandler = new ProtocolOpHandler(
            document.documentId,
            scribe.minimumSequenceNumber,
            scribe.sequenceNumber,
            lastState.members,
            lastState.proposals,
            lastState.values,
            () => -1,
            () => { return; });

        winston.info(`Proposals ${tenantId}/${documentId}: ${JSON.stringify(document)}`);

        return new ScribeLambda(
            context,
            this.documentCollection,
            this.messageCollection,
            document,
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
        const existingRef = await gitManager.getRef(documentId);
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
