import { Router } from "express";
import * as nconf from "nconf";
import * as services from "../../services";
import * as utils from "../utils";

export function create(store: nconf.Provider, gitService: services.IGitService): Router {
    const router: Router = Router();

    router.post("/repos/:repo/git/blobs", (request, response, next) => {
        const blobP = gitService.createBlob(request.params.repo, request.body);
        utils.handleResponse(
            blobP,
            response,
            (blob) => {
                return blob;
            },
            201);
    });

    /**
     * Retrieves the given blob from the repository
     */
    router.get("/repos/:repo/git/blobs/:sha", (request, response, next) => {
        const blobP = gitService.getBlob(request.params.repo, request.params.sha);
        utils.handleResponse(
            blobP,
            response,
            (blob) => {
                return blob;
            });
    });

    return router;
}
