import { Router } from "express";
import * as nconf from "nconf";
import { StorageProvider } from "../../services";
import * as utils from "../utils";

export function create(store: nconf.Provider, provider: StorageProvider): Router {
    const router: Router = Router();

    router.post(provider.translatePath("/repos/:repo/git/trees"), (request, response, next) => {
        const treeP = provider.historian.createTree(request.params.repo, request.body);
        utils.handleResponse(
            treeP,
            response,
            false,
            201);
    });

    router.get(provider.translatePath("/repos/:repo/git/trees/:sha"), (request, response, next) => {
        const treeP = provider.historian.getTree(
            request.params.repo,
            request.params.sha,
            request.query.recursive === "1");
        utils.handleResponse(
            treeP,
            response);
    });

    return router;
}
