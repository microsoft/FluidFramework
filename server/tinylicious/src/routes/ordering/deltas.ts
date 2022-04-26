/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { DatabaseManager } from "@fluidframework/server-services-core";
import { ISequencedDocumentMessage } from "@fluidframework/protocol-definitions";
import { Router } from "express";
import { Provider } from "nconf";
import { getParam, queryParamToNumber } from "../../utils";

async function getDeltas(
    databaseManager: DatabaseManager,
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
    const db = await databaseManager.getDatabase();
    const collection = db.collection<any>(collectionName);
    const dbDeltas = await collection.find(query, { "operation.sequenceNumber": 1 });

    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return dbDeltas.map((delta) => delta.operation);
}

export function create(config: Provider, databaseManager: DatabaseManager): Router {
    const deltasCollectionName = config.get("mongo:collectionNames:deltas");
    const router: Router = Router();

    /**
     * Retrieves deltas for the given document. With an optional from and to range (both exclusive) specified
     */
    router.get("/:tenantId/:id", (request, response, next) => {
        const from = queryParamToNumber(request.query.from);
        const to = queryParamToNumber(request.query.to);
        const tenantId = getParam(request.params, "tenantId");

        // Query for the deltas and return a filtered version of just the operations field
        const deltasP = getDeltas(
            databaseManager,
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

    return router;
}
