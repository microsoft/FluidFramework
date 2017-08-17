import { Router } from "express";
import * as nconf from "nconf";
import * as services from "../../services";
import * as utils from "../utils";

export function create(store: nconf.Provider, gitService: services.IGitService, cacheService: services.ICache): Router {
    const router: Router = Router();

    router.get("/repos/:repo/contents/*", (request, response, next) => {
        const contentP = gitService.getContent(request.params.repo, request.params[0], request.query.sha);
        utils.handleResponse(
            contentP,
            response,
            (commits) => {
                return commits;
            });
    });

    return router;
}
