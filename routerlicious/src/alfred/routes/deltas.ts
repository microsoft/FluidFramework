import { Router } from "express";
import { Provider } from "nconf";
import * as api from "../../api-core";
import * as utils from "../../utils";

export function getDeltas(
    mongoManager: utils.MongoManager,
    collectionName: string,
    documentId: string,
    from?: number,
    to?: number): Promise<api.ISequencedDocumentMessage[]> {

    // Create an optional filter to restrict the delta range
    const query: any = { documentId };
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
    const deltasP = mongoManager.getDatabase().then(async (db) => {
        const collection = await db.collection<any>(collectionName);
        const dbDeltas = await collection.find(query, { "operation.sequenceNumber": 1 });

        return dbDeltas.map((delta) => delta.operation);
    });

    return deltasP;
}

export function create(config: Provider, mongoManager: utils.MongoManager): Router {
    const deltasCollectionName = config.get("mongo:collectionNames:deltas");
    const router: Router = Router();

    function stringToSequenceNumber(value: string): number {
        const parsedValue = parseInt(value, 10);
        return isNaN(parsedValue) ? undefined : parsedValue;
    }

    /**
     * Retrieves deltas for the given document. With an optional from and to range (both exclusive) specified
     */
    router.get("/:id", (request, response, next) => {
        const from = stringToSequenceNumber(request.query.from);
        const to = stringToSequenceNumber(request.query.to);

        // Query for the deltas and return a filtered version of just the operations field
        const deltasP = getDeltas(mongoManager, deltasCollectionName, request.params.id, from, to);

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
