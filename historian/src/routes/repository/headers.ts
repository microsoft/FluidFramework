import { Router } from "express";
import * as nconf from "nconf";
import { StorageProvider } from "../../services";
import * as utils from "../utils";

export function create(store: nconf.Provider, provider: StorageProvider): Router {
    const router: Router = Router();

    router.get(provider.translatePath("/repos/:owner?/:repo/headers/:sha"), (request, response, next) => {
        const headerP = provider.historian.getHeader(request.params.owner, request.params.repo, request.params.sha);
        utils.handleResponse(headerP, response);
    });

    return router;
}
