/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ISequencedDocumentMessage } from "@microsoft/fluid-protocol-definitions";
import {
    IRawOperationMessage,
    IRawOperationMessageBatch,
    ITenantManager,
    MongoManager,
} from "@microsoft/fluid-server-services-core";
import { Router } from "express";
import { Provider } from "nconf";
import { IAlfredTenant } from "@microsoft/fluid-server-services-client";
import { getParam } from "../../utils";

const sequenceNumber = "sequenceNumber";

export async function getDeltaContents(
    mongoManager: MongoManager,
    collectionName: string,
    tenantId: string,
    documentId: string,
    from?: number,
    to?: number): Promise<any[]> {
    // Create an optional filter to restrict the delta range
    const query: any = { documentId, tenantId };
    if (from !== undefined || to !== undefined) {
        query[sequenceNumber] = {};

        if (from !== undefined) {
            query[sequenceNumber].$gt = from;
        }

        if (to !== undefined) {
            query[sequenceNumber].$lt = to;
        }
    }

    // Query for the deltas and return a filtered version of just the operations field
    const db = await mongoManager.getDatabase();
    // eslint-disable-next-line @typescript-eslint/await-thenable
    const collection = await db.collection<any>(collectionName);
    const dbDeltas = await collection.find(query, { sequenceNumber: 1 });

    return dbDeltas;
}

export async function getDeltas(
    mongoManager: MongoManager,
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

    // Query for the deltas and return a filtered version of just the operations field
    const db = await mongoManager.getDatabase();
    // eslint-disable-next-line @typescript-eslint/await-thenable
    const collection = await db.collection<any>(collectionName);
    const dbDeltas = await collection.find(query, { "operation.sequenceNumber": 1 });

    return dbDeltas.map((delta) => delta.operation);
}

async function getDeltasFromStorage(
    mongoManager: MongoManager,
    collectionName: string,
    tenantId: string,
    documentId: string,
    fromTerm: number,
    toTerm: number,
    fromSeq?: number,
    toSeq?: number): Promise<ISequencedDocumentMessage[]> {
    const query: any = { documentId, tenantId };
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
    const db = await mongoManager.getDatabase();
    // eslint-disable-next-line @typescript-eslint/await-thenable
    const collection = await db.collection<any>(collectionName);
    const dbDeltas = await collection.find(query, { "operation.term": 1, "operation.sequenceNumber": 1 });

    return dbDeltas.map((delta) => delta.operation);
}

async function getDeltasFromSummaryAndStorage(
    tenantManager: ITenantManager,
    mongoManager: MongoManager,
    collectionName: string,
    tenantId: string,
    documentId: string,
    from?: number,
    to?: number) {
    const tenant = await tenantManager.getTenant(tenantId);
    const gitManager = tenant.gitManager;

    const existingRef = await gitManager.getRef(encodeURIComponent(documentId));
    if (!existingRef) {
        return getDeltasFromStorage(mongoManager, collectionName, tenantId, documentId, 1, 1, from, to);
    } else {
        const [deliContent, opsContent] = await Promise.all([
            gitManager.getContent(existingRef.object.sha, ".serviceProtocol/deli"),
            gitManager.getContent(existingRef.object.sha, ".logTail/logTail"),
        ]);
        const opsFromSummary = JSON.parse(
            Buffer.from(opsContent.content, opsContent.encoding).toString()) as ISequencedDocumentMessage[];

        const deli = JSON.parse(Buffer.from(deliContent.content, deliContent.encoding).toString());
        const term = deli.term;

        const fromSeq = opsFromSummary.length > 0 ? opsFromSummary[opsFromSummary.length - 1].sequenceNumber : from;
        const opsFromStorage = await getDeltasFromStorage(
            mongoManager,
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

export async function getRawDeltas(
    mongoManager: MongoManager,
    collectionName: string,
    tenantId?: string,
    documentId?: string): Promise<IRawOperationMessage[]> {
    // Create an optional filter to restrict the delta range
    const query: any = { documentId, tenantId };

    // Query for the raw batches and sort by the index:
    const db = await mongoManager.getDatabase();
    // eslint-disable-next-line @typescript-eslint/await-thenable
    const collection = await db.collection<any>(collectionName);
    const dbDump: IRawOperationMessageBatch[] =
        await collection.find(query, { index: 1 });

    // Strip "combined" ops down to their essence as arrays of individual ops:
    const arrayOfArrays: IRawOperationMessage[][] =
        dbDump.map((messageBatch) => messageBatch.contents);

    // Flatten the ordered array of arrays into one ordered array of ops:
    const allDeltas = ([] as IRawOperationMessage[]).concat(...arrayOfArrays);

    return allDeltas;
}

export function create(
    config: Provider,
    tenantManager: ITenantManager,
    mongoManager: MongoManager,
    appTenants: IAlfredTenant[]): Router {
    const deltasCollectionName = config.get("mongo:collectionNames:deltas");
    const rawDeltasCollectionName = config.get("mongo:collectionNames:rawdeltas");
    const router: Router = Router();

    function stringToSequenceNumber(value: any): number {
        if (typeof value !== "string") { return undefined; }
        const parsedValue = parseInt(value, 10);
        return isNaN(parsedValue) ? undefined : parsedValue;
    }

    /**
     * Retrieves raw (unsequenced) deltas for the given document.
     */
    router.get("/raw/:tenantId?/:id", (request, response, next) => {
        const tenantId = getParam(request.params, "tenantId") || appTenants[0].id;

        // Query for the raw deltas (no from/to since we want all of them)
        const deltasP = getRawDeltas(
            mongoManager,
            rawDeltasCollectionName,
            tenantId,
            getParam(request.params, "id"));

        deltasP.then(
            (deltas) => {
                response.status(200).json(deltas);
            },
            (error) => {
                response.status(500).json(error);
            });
    });

    /**
     * Retrieves deltas for the given document. With an optional from and to range (both exclusive) specified
     */
    router.get("/:tenantId?/:id", (request, response, next) => {
        const from = stringToSequenceNumber(request.query.from);
        const to = stringToSequenceNumber(request.query.to);
        const tenantId = getParam(request.params, "tenantId") || appTenants[0].id;

        // Query for the deltas and return a filtered version of just the operations field
        const deltasP = getDeltas(
            mongoManager,
            deltasCollectionName,
            tenantId,
            getParam(request.params, "id"),
            from,
            to);

        deltasP.then(
            (deltas) => {
                response.status(200).json(deltas);
            },
            (error) => {
                response.status(500).json(error);
            });
    });

    /**
     * New api that fetches ops from summary and storage.
     * Retrieves deltas for the given document. With an optional from and to range (both exclusive) specified
     */
    router.get(["/v1/:tenantId?/:id", "/:tenantId?/:id/v1"], (request, response, next) => {
        const from = stringToSequenceNumber(request.query.from);
        const to = stringToSequenceNumber(request.query.to);
        const tenantId = getParam(request.params, "tenantId") || appTenants[0].id;

        // Query for the deltas and return a filtered version of just the operations field
        const deltasP = getDeltasFromSummaryAndStorage(
            tenantManager,
            mongoManager,
            deltasCollectionName,
            tenantId,
            getParam(request.params, "id"),
            from,
            to);

        deltasP.then(
            (deltas) => {
                response.status(200).json(deltas);
            },
            (error) => {
                response.status(500).json(error);
            });
    });

    /**
     * Retrieves delta contents for the given document. With an optional from and to range (both exclusive) specified
     * @deprecated path "/content:tenantId?/:id" currently kept for backwards compatibility
     */
    router.get(["/content/:tenantId?/:id", "/:tenantId?/:id/content"], (request, response, next) => {
        const from = stringToSequenceNumber(request.query.from);
        const to = stringToSequenceNumber(request.query.to);
        const tenantId = getParam(request.params, "tenantId") || appTenants[0].id;

        // Query for the deltas and return a filtered version of just the operations field
        const deltasP = getDeltaContents(
            mongoManager,
            "content",
            tenantId,
            getParam(request.params, "id"),
            from,
            to);

        deltasP.then(
            (deltas) => {
                response.status(200).json(deltas);
            },
            (error) => {
                response.status(500).json(error);
            });
    });

    return router;
}
