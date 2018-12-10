import { IDocumentStorage } from "@prague/services-core";
import { Router } from "express";
import { IAlfredTenant } from "../../tenant";

export function create(storage: IDocumentStorage, appTenants: IAlfredTenant[]): Router {

    const router: Router = Router();

    router.get("/:tenantId?/:id", (request, response, next) => {
        const documentP = storage.getDocument(
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
