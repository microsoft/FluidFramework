import { Router } from "express";
import * as nconf from "nconf";
import * as services from "../../services";
import * as utils from "../utils";

export function create(store: nconf.Provider, gitService: services.IGitService, cacheService: services.ICache): Router {
    const router: Router = Router();

    router.post("/repos/:repo/git/tags", (request, response, next) => {
        const tagP = gitService.createTag(request.params.repo, request.body);
        utils.handleResponse(
            tagP,
            response,
            (tag) => {
                return tag;
            },
            201);
    });

    router.get("/repos/:repo/git/tags/*", (request, response, next) => {
        const tagP = gitService.getTag(request.params.repo, request.params[0]);
        utils.handleResponse(
            tagP,
            response,
            (tag) => {
                return tag;
            });
    });

    return router;
}
