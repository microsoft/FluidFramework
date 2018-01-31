import { Router } from "express";
import * as nconf from "nconf";
import { StorageProvider } from "../../services";
import * as utils from "../utils";

export function create(store: nconf.Provider, provider: StorageProvider): Router {
    const router: Router = Router();

    /**
     * Creates a new git repository
     */
    router.post(provider.translatePath("/repos"), (request, response, next) => {
        const repoP = provider.historian.createRepo(request.body);
        utils.handleResponse(
            repoP,
            response,
            false,
            201);
    });

    /**
     * Retrieves an existing get repository
     */
    router.get(provider.translatePath("/repos/:repo"), (request, response, next) => {
        const repoP = provider.historian.getRepo(request.params.repo);
        utils.handleResponse(
            repoP,
            response,
            false);
    });

    return router;
}
