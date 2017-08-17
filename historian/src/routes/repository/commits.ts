import { Router } from "express";
import * as nconf from "nconf";
import * as services from "../../services";
import * as utils from "../utils";

export function create(store: nconf.Provider, gitService: services.IGitService, cacheService: services.ICache): Router {
    const router: Router = Router();

    router.get("/repos/:repo/commits", (request, response, next) => {
        const commitsP = gitService.getCommits(request.params.repo, request.query.sha, request.query.count);
        utils.handleResponse(
            commitsP,
            response,
            (commits) => {
                return commits;
            });
    });

    return router;
}
