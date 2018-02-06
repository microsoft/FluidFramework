import { Router } from "express";
import * as nconf from "nconf";
import { StorageProvider } from "../../services";
import * as utils from "../utils";

export function create(store: nconf.Provider, provider: StorageProvider): Router {
    const router: Router = Router();

    router.post(provider.translatePath("/repos/:owner?/:repo/git/trees"), (request, response, next) => {
        const treeP = provider.gitService.createTree(request.params.owner, request.params.repo, request.body);
        utils.handleResponse(
            treeP,
            response,
            false,
            201);
    });

    router.get(provider.translatePath("/repos/:owner?/:repo/git/trees/:sha"), (request, response, next) => {
        const useCache = !("disableCache" in request.query);
        const treeP = provider.gitService.getTree(
            request.params.owner,
            request.params.repo,
            request.params.sha,
            request.query.recursive === "1",
            useCache);
        utils.handleResponse(
            treeP,
            response,
            useCache);
    });

    return router;
}
