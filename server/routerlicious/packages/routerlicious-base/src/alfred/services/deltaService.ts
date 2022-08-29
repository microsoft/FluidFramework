/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { toUtf8 } from "@fluidframework/common-utils";
import { ISequencedDocumentMessage } from "@fluidframework/protocol-definitions";
import {
    IDeltaService,
    ISequencedOperationMessage,
    ITenantManager,
    MongoManager,
} from "@fluidframework/server-services-core";

export class DeltaService implements IDeltaService {
    constructor(
        protected readonly mongoManager: MongoManager,
        protected readonly tenantManager: ITenantManager,
    ) { }

    public async getDeltas(
        collectionName: string,
        tenantId: string,
        documentId: string,
        from?: number,
        to?: number): Promise<ISequencedDocumentMessage[]> {
        // Create an optional filter to restrict the delta range
        const query: any = { documentId, tenantId };
        if (from !== undefined || to !== undefined) {
            query["operation.sequenceNumber"] = {};

            if (from !== undefined) {
                query["operation.sequenceNumber"].$gt = from;
            }

            if (to !== undefined) {
                query["operation.sequenceNumber"].$lt = to;
            }
        }

        const sort = { "operation.sequenceNumber": 1 };
        return this.queryDeltas(collectionName, query, sort);
    }

    public async getDeltasFromStorage(
        collectionName: string,
        tenantId: string,
        documentId: string,
        fromTerm: number,
        toTerm: number,
        fromSeq?: number,
        toSeq?: number): Promise<ISequencedDocumentMessage[]> {
        const query: any = { documentId, tenantId, scheduledDeletionTime: { $exists: false } };
        query["operation.term"] = {};
        query["operation.sequenceNumber"] = {};
        query["operation.term"].$gte = fromTerm;
        query["operation.term"].$lte = toTerm;
        if (fromSeq !== undefined) {
            query["operation.sequenceNumber"].$gt = fromSeq;
        }
        if (toSeq !== undefined) {
            query["operation.sequenceNumber"].$lt = toSeq;
        }

        const sort = { "operation.term": 1, "operation.sequenceNumber": 1 };
        return this.queryDeltas(collectionName, query, sort);
    }

    private async queryDeltas(collectionName: string, query: any, sort: any): Promise<ISequencedDocumentMessage[]> {
        const db = await this.mongoManager.getDatabase();
        const collection = db.collection<ISequencedOperationMessage>(collectionName);
        const dbDeltas = await collection.find(query, sort);
        return dbDeltas.map((delta) => delta.operation);
    }

    public async getDeltasFromSummaryAndStorage(
        collectionName: string,
        tenantId: string,
        documentId: string,
        from?: number,
        to?: number) {
        const tenant = await this.tenantManager.getTenant(tenantId, documentId);
        const gitManager = tenant.gitManager;

        const existingRef = await gitManager.getRef(encodeURIComponent(documentId));
        if (!existingRef) {
            return this.getDeltasFromStorage(collectionName, tenantId, documentId, 1, 1, from, to);
        } else {
            const [deliContent, opsContent] = await Promise.all([
                gitManager.getContent(existingRef.object.sha, ".serviceProtocol/deli"),
                gitManager.getContent(existingRef.object.sha, ".logTail/logTail"),
            ]);
            const opsFromSummary = JSON.parse(
                toUtf8(opsContent.content, opsContent.encoding)) as ISequencedDocumentMessage[];

            const deli = JSON.parse(toUtf8(deliContent.content, deliContent.encoding));
            const term = deli.term;

            const fromSeq = opsFromSummary.length > 0 ? opsFromSummary[opsFromSummary.length - 1].sequenceNumber : from;
            const opsFromStorage = await this.getDeltasFromStorage(
                collectionName,
                tenantId,
                documentId,
                term,
                term,
                fromSeq,
                to);

            const ops = opsFromSummary.concat(opsFromStorage);
            if (ops.length === 0) {
                return ops;
            }
            let fromIndex = 0;
            if (from) {
                const firstSeq = ops[0].sequenceNumber;
                if (from - firstSeq >= -1) {
                    fromIndex += (from - firstSeq + 1);
                }
            }
            let toIndex = ops.length - 1;
            if (to) {
                const lastSeq = ops[ops.length - 1].sequenceNumber;
                if (lastSeq - to >= -1) {
                    toIndex -= (lastSeq - to + 1);
                }
            }
            if (toIndex - fromIndex > 0) {
                return ops.slice(fromIndex, toIndex + 1);
            }
            return [];
        }
    }
}
