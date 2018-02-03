import { Router } from "express";
import * as nconf from "nconf";
import { StorageProvider } from "../../services";
import * as utils from "../utils";

export function create(store: nconf.Provider, provider: StorageProvider): Router {
    const router: Router = Router();

    router.post(provider.translatePath("/repos/:owner?/:repo/git/commits"), (request, response, next) => {
        const commitP = provider.historian.createCommit(request.params.owner, request.params.repo, request.body);
        utils.handleResponse(
            commitP,
            response,
            false,
            201);
    });

    router.get(provider.translatePath("/repos/:owner?/:repo/git/commits/:sha"), (request, response, next) => {
        const commitP = provider.historian.getCommit(request.params.owner, request.params.repo, request.params.sha);
        utils.handleResponse(commitP, response);
    });

    return router;
}
