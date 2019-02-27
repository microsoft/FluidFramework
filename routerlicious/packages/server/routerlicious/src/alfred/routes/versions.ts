import { IDocumentStorage } from "@prague/services-core";
import { Router } from "express";
import * as safeStringify from "json-stringify-safe";
import { defaultPartials } from "./partials";

// This one is going to need to have references to all storage options

export function create(storage: IDocumentStorage, ensureLoggedIn: any): Router {

    const router: Router = Router();

    /**
     * Loads count number of latest commits.
     */
    router.get("/:tenantId/:id", ensureLoggedIn(), (request, response) => {
        const tenantId = request.params.tenantId;
        const documentId = request.params.id;

        const versionsP = storage.getVersions(tenantId, documentId, 10);
        versionsP.then(
            (versions) => {
                response.render(
                    "commits",
                    {
                        documentId,
                        partials: defaultPartials,
                        pathPostfix: "",
                        tenantId,
                        type: "loader",
                        versions: JSON.stringify(versions),
                    });
            },
            (error) => {
                response.status(400).json(safeStringify(error));
            });
    });

    return router;
}
