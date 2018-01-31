import { Router } from "express";
import * as nconf from "nconf";
import { StorageProvider } from "../../services";
import * as utils from "../utils";

export function create(store: nconf.Provider, provider: StorageProvider): Router {
    const router: Router = Router();

    router.get(provider.translatePath("/repos/:repo/commits"), (request, response, next) => {
        const commitsP = provider.historian.getCommits(request.params.repo, request.query.sha, request.query.count);
        utils.handleResponse(
            commitsP,
            response,
            false);
    });

    return router;
}
