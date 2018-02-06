import { Router } from "express";
import * as nconf from "nconf";
import { StorageProvider } from "../../services";
import * as utils from "../utils";

export function create(store: nconf.Provider, provider: StorageProvider): Router {
    const router: Router = Router();

    router.post(provider.translatePath("/repos/:owner?/:repo/git/tags"), (request, response, next) => {
        const tagP = provider.gitService.createTag(request.params.owner, request.params.repo, request.body);
        utils.handleResponse(
            tagP,
            response,
            false,
            201);
    });

    router.get(provider.translatePath("/repos/:owner?/:repo/git/tags/*"), (request, response, next) => {
        const tagP = provider.gitService.getTag(request.params.owner, request.params.repo, request.params[0]);
        utils.handleResponse(
            tagP,
            response,
            false);
    });

    return router;
}
