/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { toUtf8 } from "@fluidframework/common-utils";
import { ISequencedDocumentMessage } from "@fluidframework/protocol-definitions";
import {
    IRawOperationMessage,
    IRawOperationMessageBatch,
    ITenantManager,
    IThrottler,
    MongoManager,
} from "@fluidframework/server-services-core";
import {
    verifyStorageToken,
    throttle,
    IThrottleMiddlewareOptions,
    getParam,
} from "@fluidframework/server-services-utils";
import { validateRequestParams, handleResponse } from "@fluidframework/server-services";
import { Router } from "express";
import { Provider } from "nconf";
import winston from "winston";
import { IAlfredTenant } from "@fluidframework/server-services-client";
import { Constants } from "../../../utils";

async function getDeltas(
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

    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
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
    const db = await mongoManager.getDatabase();
    // eslint-disable-next-line @typescript-eslint/await-thenable
    const collection = await db.collection<any>(collectionName);
    const dbDeltas = await collection.find(query, { "operation.term": 1, "operation.sequenceNumber": 1 });

    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
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
    const tenant = await tenantManager.getTenant(tenantId, documentId);
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
            toUtf8(opsContent.content, opsContent.encoding)) as ISequencedDocumentMessage[];

        const deli = JSON.parse(toUtf8(deliContent.content, deliContent.encoding));
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
    appTenants: IAlfredTenant[],
    throttler: IThrottler): Router {
    const deltasCollectionName = config.get("mongo:collectionNames:deltas");
    const rawDeltasCollectionName = config.get("mongo:collectionNames:rawdeltas");
    const router: Router = Router();

    const commonThrottleOptions: Partial<IThrottleMiddlewareOptions> = {
        throttleIdPrefix: (req) => getParam(req.params, "tenantId") || appTenants[0].id,
        throttleIdSuffix: Constants.alfredRestThrottleIdSuffix,
    };

    function stringToSequenceNumber(value: any): number {
        if (typeof value !== "string") { return undefined; }
        const parsedValue = parseInt(value, 10);
        return isNaN(parsedValue) ? undefined : parsedValue;
    }

    /**
     * New api that fetches ops from summary and storage.
     * Retrieves deltas for the given document. With an optional from and to range (both exclusive) specified
     */
    router.get(
        ["/v1/:tenantId/:id", "/:tenantId/:id/v1"],
        validateRequestParams("tenantId", "id"),
        verifyStorageToken(tenantManager, config),
        throttle(throttler, winston, commonThrottleOptions),
        (request, response, next) => {
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

            handleResponse(deltasP, response, undefined, 500);
        },
    );

    /**
     * Retrieves raw (unsequenced) deltas for the given document.
     */
    router.get(
        "/raw/:tenantId/:id",
        validateRequestParams("tenantId", "id"),
        verifyStorageToken(tenantManager, config),
        throttle(throttler, winston, commonThrottleOptions),
        (request, response, next) => {
            const tenantId = getParam(request.params, "tenantId") || appTenants[0].id;

            // Query for the raw deltas (no from/to since we want all of them)
            const deltasP = getRawDeltas(
                mongoManager,
                rawDeltasCollectionName,
                tenantId,
                getParam(request.params, "id"));

            handleResponse(deltasP, response, undefined, 500);
        },
    );

    /**
     * Retrieves deltas for the given document. With an optional from and to range (both exclusive) specified
     */
    router.get(
        "/:tenantId/:id",
        validateRequestParams("tenantId", "id"),
        verifyStorageToken(tenantManager, config),
        throttle(throttler, winston, commonThrottleOptions),
        (request, response, next) => {
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

            handleResponse(deltasP, response, undefined, 500);
        },
    );

    return router;
}
