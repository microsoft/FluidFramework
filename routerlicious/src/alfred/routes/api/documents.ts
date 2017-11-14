import { Router } from "express";
import { Provider } from "nconf";
import * as git from "../../../git-storage";
import * as utils from "../../../utils";
import * as storage from "../../storage";

export function create(
    config: Provider,
    gitManager: git.GitManager,
    mongoManager: utils.MongoManager,
    producer: utils.kafkaProducer.IProducer): Router {

    const deltasCollectionName = config.get("mongo:collectionNames:documents");
    const router: Router = Router();

    router.get("/:id", (request, response, next) => {
        const documentP = storage.getDocument(mongoManager, deltasCollectionName, request.params.id);
        documentP.then(
            (document) => {
                response.status(200).json(document);
            },
            (error) => {
                response.status(400).json(error);
            });
    });

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
        const forkIdP = storage.createFork(
            producer,
            gitManager,
            mongoManager,
            deltasCollectionName,
            request.params.id);
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
