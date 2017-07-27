import { Router } from "express";
import * as nconf from "nconf";
import * as utils from "../../utils";

const mongoUrl = nconf.get("mongo:endpoint");
const objectsCollectionName = nconf.get("mongo:collectionNames:objects");

const router: Router = Router();

const mongoManager = new utils.MongoManager(mongoUrl);

/**
 * Retrieves document for the given id.
 */
router.get("/:id", (request, response, next) => {
    const id = request.params.id;
    const objectP = mongoManager.getDatabase().then(async (db) => {
        const collection = db.collection(objectsCollectionName);
        const dbObject = await collection
            .findOne({ _id: id });

        return dbObject;
    });

    objectP.then(
        (object) => {
            response.status(200).json(object);
        },
        (error) => {
            response.status(500).json(error);
        });
});

export default router;
