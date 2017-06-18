import { Router } from "express";
import * as nconf from "nconf";
import * as utils from "../../utils";

const mongoUrl = nconf.get("mongo:endpoint");
const deltasCollectionName = nconf.get("mongo:collectionNames:deltas");

const router: Router = Router();

const mongoManager = new utils.MongoManager(mongoUrl);

/**
 * Retrieves deltas for the given document. With an optional from and to range (both exclusive) specified
 */
router.get("/:id", (request, response, next) => {
    // Create an optional filter to restrict the delta range
    const query: any = { objectId: request.params.id };
    if (request.query.from || request.query.to) {
        query["operation.sequenceNumber"] = {};

        if (request.query.from) {
            query["operation.sequenceNumber"].$gt = parseInt(request.query.from, 10);
        }

        if (request.query.to) {
            query["operation.sequenceNumber"].$lt = parseInt(request.query.to, 10);
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

    deltasP.then(
        (deltas) => {
            response.status(200).json(deltas);
        },
        (error) => {
            response.status(500).json(error);
        });
});

export default router;
