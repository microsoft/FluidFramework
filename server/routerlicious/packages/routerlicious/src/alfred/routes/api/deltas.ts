/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ISequencedDocumentMessage } from "@microsoft/fluid-protocol-definitions";
import {
    IRawOperationMessage,
    IRawOperationMessageBatch,
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
    mongoManager: MongoManager,
    appTenants: IAlfredTenant[]): Router {
    const deltasCollectionName = config.get("mongo:collectionNames:deltas");
    const rawDeltasCollectionName = config.get("mongo:collectionNames:rawdeltas");
    const router: Router = Router();

    function stringToSequenceNumber(value: string): number {
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
