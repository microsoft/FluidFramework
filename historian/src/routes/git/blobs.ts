import { Router } from "express";
import * as nconf from "nconf";
import { StorageProvider } from "../../services";
import * as utils from "../utils";

export function create(store: nconf.Provider, provider: StorageProvider): Router {
    const router: Router = Router();

    router.post(provider.translatePath("/repos/:repo/git/blobs"), (request, response, next) => {
        const blobP = provider.historian.createBlob(request.params.repo, request.body);
        utils.handleResponse(
            blobP,
            response,
            false,
            201);
    });

    /**
     * Retrieves the given blob from the repository
     */
    router.get(provider.translatePath("/repos/:repo/git/blobs/:sha"), (request, response, next) => {
        const blobP = provider.historian.getBlob(request.params.repo, request.params.sha);
        utils.handleResponse(
            blobP,
            response);
    });

    return router;
}
