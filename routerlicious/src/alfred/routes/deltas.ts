import * as express from "express";
import { MongoClient } from "mongodb";
import * as nconf from "nconf";

const router = express.Router();

// Connect to the database - TODO we should provide these as inputs to the module rather than have them
// take a dependency on them
const mongoUrl = nconf.get("mongo:endpoint");
const mongoClientP = MongoClient.connect(mongoUrl);
const collectionP = mongoClientP.then(async (db) => {
    const deltasCollectionName = nconf.get("mongo:collectionNames:deltas");
    const collection = db.collection(deltasCollectionName);
    return collection;
});

/**
 * Retrieves deltas for the given document. With an optional from and to range (both exclusive) specified
 */
router.get("/:id", async (request, response, next) => {
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
    const collection = await collectionP;
    const dbDeltas = await collection
        .find(query)
        .sort({ "operation.sequenceNumber": 1 })
        .toArray();
    const deltas = dbDeltas.map((delta) => delta.operation);

    response.status(200).json(deltas);
});

export default router;
