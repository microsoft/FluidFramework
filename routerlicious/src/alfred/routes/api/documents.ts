import { Router } from "express";
import { Provider } from "nconf";
import { ITenantManager } from "../../../api-core";
import * as utils from "../../../utils";
import * as storage from "../../storage";
import { IAlfredTenant } from "../../tenant";

export function create(
    config: Provider,
    tenantManager: ITenantManager,
    mongoManager: utils.MongoManager,
    producer: utils.kafkaProducer.IProducer,
    appTenants: IAlfredTenant[]): Router {

    const documentsCollectionName = config.get("mongo:collectionNames:documents");
    const router: Router = Router();

    router.get("/:tenantId?/:id", (request, response, next) => {
        const documentP = storage.getDocument(
            mongoManager,
            documentsCollectionName,
            request.params.tenantId || appTenants[0].id,
            request.params.id);
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
    router.get("/:tenantId?/:id/forks", (request, response, next) => {
        const forksP = storage.getForks(
            mongoManager,
            documentsCollectionName,
            request.params.tenantId || appTenants[0].id,
            request.params.id);
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
    router.post("/:tenantId?/:id/forks", (request, response, next) => {
        const forkIdP = storage.createFork(
            producer,
            tenantManager,
            mongoManager,
            documentsCollectionName,
            request.params.tenantId || appTenants[0].id,
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
