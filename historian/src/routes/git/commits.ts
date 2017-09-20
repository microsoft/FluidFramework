import { Router } from "express";
import * as git from "gitresources";
import * as nconf from "nconf";
import * as utils from "../utils";

export function create(store: nconf.Provider, gitService: git.IGitService): Router {
    const router: Router = Router();

    router.post("/repos/:repo/git/commits", (request, response, next) => {
        const commitP = gitService.createCommit(request.params.repo, request.body);
        utils.handleResponse(
            commitP,
            response,
            false,
            201);
    });

    router.get("/repos/:repo/git/commits/:sha", (request, response, next) => {
        const commitP = gitService.getCommit(request.params.repo, request.params.sha);
        utils.handleResponse(commitP, response);
    });

    return router;
}
