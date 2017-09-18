import { Router } from "express";
import * as git from "gitresources";
import * as nconf from "nconf";
import * as utils from "../utils";

export function create(store: nconf.Provider, gitService: git.IGitService): Router {
    const router: Router = Router();

    router.post("/repos/:repo/git/tags", (request, response, next) => {
        const tagP = gitService.createTag(request.params.repo, request.body);
        utils.handleResponse(
            tagP,
            response,
            false,
            201);
    });

    router.get("/repos/:repo/git/tags/*", (request, response, next) => {
        const tagP = gitService.getTag(request.params.repo, request.params[0]);
        utils.handleResponse(
            tagP,
            response,
            false);
    });

    return router;
}
