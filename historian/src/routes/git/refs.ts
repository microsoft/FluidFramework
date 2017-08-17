import { Router } from "express";
import * as nconf from "nconf";

export function create(store: nconf.Provider): Router {
    const router: Router = Router();

    // https://developer.github.com/v3/git/refs/

    router.get("/repos/:repo/git/refs", (request, response, next) => {
        return response.status(200).json({});
    });

    router.get("/repos/:repo/git/refs/*", (request, response, next) => {
        return response.status(200).json({});
    });

    router.post("/repos/:repo/git/refs", (request, response, next) => {
        return response.status(201).json({});
    });

    router.patch("/repos/:repo/git/refs/*", (request, response, next) => {
        return response.status(200).json({});
    });

    router.delete("/repos/:repo/git/refs/*", (request, response, next) => {
        return response.status(204).json({});
    });

    return router;
}
