import { Router } from "express";
import * as nconf from "nconf";
import { ICache } from "../../services";
import * as utils from "../utils";

export function create(store: nconf.Provider, cache: ICache): Router {
    const router: Router = Router();

    router.post("/repos/:owner?/:repo/git/blobs", (request, response, next) => {
        const blobP = provider.gitService.createBlob(request.params.owner, request.params.repo, request.body);

        utils.handleResponse(
            blobP,
            response,
            false,
            201);
    });

    /**
     * Retrieves the given blob from the repository
     */
    router.get("/repos/:owner?/:repo/git/blobs/:sha", (request, response, next) => {
        const useCache = !("disableCache" in request.query);

        const blobP = provider.gitService.getBlob(
            request.params.owner,
            request.params.repo,
            request.params.sha,
            useCache);
        utils.handleResponse(
            blobP,
            response,
            useCache);
    });

    return router;
}
