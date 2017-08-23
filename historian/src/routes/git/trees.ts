import { Router } from "express";
import * as nconf from "nconf";
import * as services from "../../services";
import * as utils from "../utils";

export function create(store: nconf.Provider, gitService: services.IGitService): Router {
    const router: Router = Router();

    router.post("/repos/:repo/git/trees", (request, response, next) => {
        const treeP = gitService.createTree(request.params.repo, request.body);
        utils.handleResponse(
            treeP,
            response,
            false,
            201);
    });

    router.get("/repos/:repo/git/trees/:sha", (request, response, next) => {
        const treeP = gitService.getTree(request.params.repo, request.params.sha, request.query.recursive === "1");
        utils.handleResponse(
            treeP,
            response);
    });

    return router;
}
