import { Router } from "express";
import * as git from "gitresources";
import * as nconf from "nconf";
import * as utils from "../utils";

export function create(store: nconf.Provider, gitService: git.IGitService): Router {
    const router: Router = Router();

    router.post("/repos/:repo/git/blobs", (request, response, next) => {
        const blobP = gitService.createBlob(request.params.repo, request.body);
        utils.handleResponse(
            blobP,
            response,
            false,
            201);
    });

    /**
     * Retrieves the given blob from the repository
     */
    router.get("/repos/:repo/git/blobs/:sha", (request, response, next) => {
        const blobP = gitService.getBlob(request.params.repo, request.params.sha);
        utils.handleResponse(
            blobP,
            response);
    });

    return router;
}
