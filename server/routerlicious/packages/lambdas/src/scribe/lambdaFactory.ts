/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable no-null/no-null */

import { EventEmitter } from "events";
import { IRef } from "@microsoft/fluid-gitresources";
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
    protocolState: {
        members: [],
        minimumSequenceNumber: 0,
        proposals: [],
        sequenceNumber: 0,
        values: [],
    },
    sequenceNumber: 0,
};

interface ILatestSummaryState {
    ref: IRef;
    protocolHead: number;
}

interface ISummaryCheckpoint {
    scribe: string;
    messages: ISequencedOperationMessage[];
}

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
            this.fetchLatestSummaryState(gitManager, documentId, context.log),
            this.documentCollection.findOne({ documentId, tenantId }),
        ]);

        // If the document doesn't exist then we trivially accept every message
        if (!document) {
            context.log.info(`Creating NoOpLambda due to missing ${tenantId}/${documentId}`);
            return new NoOpLambda(context);
        }

        let messages = await this.messageCollection.find({ documentId, tenantId }, { "operation.sequenceNumber": 1 });

        // Restore scribe state if not present in the cache. Mongodb casts undefined as null so we are checking
        // both to be safe. Empty sring denotes a cache that was cleared due to a service summary
        if (document.scribe === undefined || document.scribe === null) {
            context.log.info(`New document. Setting empty scribe checkpoint for ${tenantId}/${documentId}`);
            document.scribe = JSON.stringify(DefaultScribe);
        } else if (document.scribe === "") {
            context.log.info(`Loading scribe state from service summary for ${tenantId}/${documentId}`);
            const summaryState: ISummaryCheckpoint = await this.loadStateFromSummary(
                tenantId,
                documentId,
                gitManager,
                latestSummary.ref,
                context.log);
            document.scribe = summaryState.scribe;
            messages = summaryState.messages;
        } else {
            context.log.info(`Loading scribe state from cache for ${tenantId}/${documentId}`);
        }

        const scribe: IScribe = JSON.parse(document.scribe);
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
            latestSummary.protocolHead,
            messages,
            true);
    }

    public async dispose(): Promise<void> {
        await this.mongoManager.close();
    }

    private async fetchLatestSummaryState(
        gitManager: IGitManager,
        documentId: string,
        logger: ILogger): Promise<ILatestSummaryState> {
        const existingRef = await gitManager.getRef(encodeURIComponent(documentId));
        if (!existingRef) {
            return {
                ref: existingRef,
                protocolHead: 0,
            };
        }

        try {
            const content = await gitManager.getContent(existingRef.object.sha, ".protocol/attributes");
            const attributes =
                JSON.parse(Buffer.from(content.content, content.encoding).toString()) as IDocumentAttributes;

            return {
                ref: existingRef,
                protocolHead: attributes.sequenceNumber,
            };
        } catch (exception) {
            logger.error(`Error fetching protocol state`);
            logger.error(JSON.stringify(exception));
            return {
                ref: existingRef,
                protocolHead: 0,
            };
        }
    }

    // When scribe cache is cleared, we need to hydrate from last summary.
    // We should fail when no service summary is present. For now we are just logging it for better telemetry.
    private async loadStateFromSummary(
        tenantId: string,
        documentId: string,
        gitManager: IGitManager,
        existingRef: IRef,
        logger: ILogger): Promise<ISummaryCheckpoint> {
        if (!existingRef) {
            logger.error(`No service summary present for ${tenantId}/${documentId}`);
            return {
                messages: [],
                scribe: JSON.stringify(DefaultScribe),
            };
        } else {
            try {
                const scribeContent = await gitManager.getContent(existingRef.object.sha, ".serviceProtocol/scribe");
                const scribe = Buffer.from(scribeContent.content, scribeContent.encoding).toString();
                const opsContent = await gitManager.getContent(existingRef.object.sha, ".logTail/logTail");
                const messages = JSON.parse(
                    Buffer.from(opsContent.content, opsContent.encoding).toString()) as ISequencedOperationMessage[];
                return {
                    scribe,
                    messages,
                };
            } catch (exception) {
                logger.error(`Error fetching scribe state from summary: ${tenantId}/${documentId}`);
                logger.error(JSON.stringify(exception));
                return {
                    messages: [],
                    scribe: JSON.stringify(DefaultScribe),
                };
            }
        }
    }
}
