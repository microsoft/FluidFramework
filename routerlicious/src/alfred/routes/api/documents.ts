import { Router } from "express";
import { Provider } from "nconf";
// import * as api from "../../../api-core";
import * as utils from "../../../utils";
import * as storage from "../../storage";

export function create(config: Provider, mongoManager: utils.MongoManager): Router {
    const deltasCollectionName = config.get("mongo:collectionNames:documents");
    const router: Router = Router();

    /**
     * Lists all forks of the specified document
     */
    router.get("/:id/forks", (request, response, next) => {
        const forksP = storage.getForks(mongoManager, deltasCollectionName, request.params.id);
        forksP.then(
            (forks) => {
                response.status(200).json(forks);
            },
            (error) => {
                response.status(400).json(error);
            });
    });

    /**
     * Creates a new fork for the specified document
     */
    router.post("/:id/forks", (request, response, next) => {
        const forkIdP = storage.createFork(mongoManager, deltasCollectionName, request.params.id);
        forkIdP.then(
            (forkId) => {
                response.status(201).json(forkId);
            },
            (error) => {
                response.status(400).json(error);
            });
    });

    return router;
}
