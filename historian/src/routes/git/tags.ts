import { Router } from "express";
import * as nconf from "nconf";

export function create(store: nconf.Provider): Router {
    const router: Router = Router();

    router.post("/repos/:repo/git/tags", (request, response, next) => {
        return response.status(201).json({ });
    });

    router.get("/repos/:repo/git/tags/:sha", (request, response, next) => {
        return response.status(200).json({ });
    });

    return router;
}
