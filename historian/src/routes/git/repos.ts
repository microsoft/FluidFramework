import { Router } from "express";
import * as git from "gitresources";
import * as nconf from "nconf";
import * as utils from "../utils";

export function create(store: nconf.Provider, gitService: git.IGitService): Router {
    const router: Router = Router();

    /**
     * Creates a new git repository
     */
    router.post("/repos", (request, response, next) => {
        const repoP = gitService.createRepo(request.body);
        utils.handleResponse(
            repoP,
            response,
            false,
            201);
    });

    /**
     * Retrieves an existing get repository
     */
    router.get("/repos/:repo", (request, response, next) => {
        const repoP = gitService.getRepo(request.params.repo);
        utils.handleResponse(
            repoP,
            response,
            false);
    });

    return router;
}
