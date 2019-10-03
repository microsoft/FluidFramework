/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ISequencedDocumentMessage } from "@microsoft/fluid-protocol-definitions";
import { IAlfredTenant, MongoManager } from "@microsoft/fluid-server-services-core";
import { Router } from "express";
import { Provider } from "nconf";
import { getParam } from "../../utils";
// tslint:disable-next-line
import winston = require("winston");

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
    to?: number,
    sequenceNumbersName?: string): Promise<ISequencedDocumentMessage[]> {

    // Create an optional filter to restrict the delta range
    const query: any = { documentId, tenantId };
    const seqField =
        sequenceNumbersName ? sequenceNumbersName : "operation.sequenceNumber";
    winston.info(`hey a request for deltas: ${sequenceNumbersName}`);

    if (from !== undefined || to !== undefined) {
        query[seqField] = {};

        if (from !== undefined) {
            query[seqField].$gt = from;
        }

        if (to !== undefined) {
            query[seqField].$lt = to;
        }
    }

    // Query for the deltas and return a filtered version of just the operations field
    const db = await mongoManager.getDatabase();
    const collection = await db.collection<any>(collectionName);
    const dbDeltas = await collection.find(query, { [seqField] : 1 });

    return dbDeltas.map((delta) => delta.operation);
}

export function create(config: Provider, mongoManager: MongoManager, appTenants: IAlfredTenant[]): Router {
    const deltasCollectionName = config.get("mongo:collectionNames:deltas");
    const rawdeltasCollectionName = config.get("mongo:collectionNames:rawdeltas");
    const router: Router = Router();

    function stringToSequenceNumber(value: string): number {
        const parsedValue = parseInt(value, 10);
        return isNaN(parsedValue) ? undefined : parsedValue;
    }

    /**
     * Retrieves raw (unsequenced) deltas for the given document.
     */
    router.get("/raw/:tenantId?/:id", (request, response, next) => {
        const from = stringToSequenceNumber(request.query.from);
        const to = stringToSequenceNumber(request.query.to);
        const tenantId = getParam(request.params, "tenantId") || appTenants[0].id;

        // Query for the deltas and return a filtered version of just the operations field
        const deltasP = getDeltas(
            mongoManager,
            rawdeltasCollectionName,
            tenantId,
            getParam(request.params, "id"),
            from,
            to,
            "batchedSequenceNumber");

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
