import { Router } from "express";
import * as nconf from "nconf";

export function create(store: nconf.Provider): Router {
    const router: Router = Router();

    router.get("/repos/:repo/contents/*", (request, response, next) => {
        return response.status(200).json({ });
    });

    return router;
}
