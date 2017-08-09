import { Router } from "express";
import * as nconf from "nconf";
import * as api from "../../api";
import * as utils from "../../utils";

const mongoUrl = nconf.get("mongo:endpoint");
const deltasCollectionName = nconf.get("mongo:collectionNames:deltas");

const router: Router = Router();

const mongoManager = new utils.MongoManager(mongoUrl);

export function getDeltas(documentId: string, from?: number, to?: number): Promise<api.ISequencedDocumentMessage[]> {
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
        const collection = db.collection(deltasCollectionName);
        const dbDeltas = await collection
            .find(query)
            .sort({ "operation.sequenceNumber": 1 })
            .toArray();

        return dbDeltas.map((delta) => delta.operation);
    });

    return deltasP;
}

function stringToSequenceNumber(value: string): number {
    const parsedValue = parseInt(value, 10);
    return isNaN(parsedValue) ? undefined : parsedValue;
}

/**
 * Retrieves deltas for the given document. With an optional from and to range (both exclusive) specified
 */
router.get("/:id", (request, response, next) => {
    const from = stringToSequenceNumber(request.params.from);
    const to = stringToSequenceNumber(request.params.to);

    // Query for the deltas and return a filtered version of just the operations field
    const deltasP = getDeltas(request.params.id, from, to);

    deltasP.then(
        (deltas) => {
            response.status(200).json(deltas);
        },
        (error) => {
            response.status(500).json(error);
        });
});

export default router;
