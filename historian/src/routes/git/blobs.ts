import { Router } from "express";
import * as nconf from "nconf";

export function create(store: nconf.Provider): Router {
    const router: Router = Router();

    router.post("/repos/:repo/git/blobs", (request, response, next) => {
        return response.status(201).json({});
    });

    /**
     * Retrieves the given blob from the repository
     */
    router.get("/repos/:repo/git/blobs/:sha", (request, response, next) => {
        return response.status(200).json({});
    });

    return router;
}
