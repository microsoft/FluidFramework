import { Router } from "express";
import * as nconf from "nconf";
import { StorageProvider } from "../../services";
import * as utils from "../utils";

export function create(store: nconf.Provider, provider: StorageProvider): Router {
    const router: Router = Router();

    router.get(provider.translatePath("/repos/:owner?/:repo/contents/*"), (request, response, next) => {
        const contentP = provider.historian.getContent(
            request.params.owner,
            request.params.repo,
            request.params[0],
            request.query.ref);
        utils.handleResponse(
            contentP,
            response,
            false);
    });

    return router;
}
