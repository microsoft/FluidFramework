import { Router } from "express";
import * as git from "gitresources";
import * as nconf from "nconf";
import * as utils from "../utils";

export function create(store: nconf.Provider, gitService: git.IGitService): Router {
    const router: Router = Router();

    router.get("/repos/:repo/commits", (request, response, next) => {
        const commitsP = gitService.getCommits(request.params.repo, request.query.sha, request.query.count);
        utils.handleResponse(
            commitsP,
            response,
            false);
    });

    return router;
}
