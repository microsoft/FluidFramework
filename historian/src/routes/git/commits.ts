import { Router } from "express";
import { ICommitHash, ICreateCommitParams } from "gitresources";
import * as nconf from "nconf";
import { StorageProvider } from "../../services";
import * as utils from "../utils";

export function create(store: nconf.Provider, provider: StorageProvider): Router {
    const router: Router = Router();

    router.post(provider.translatePath("/repos/:owner?/:repo/git/commits"), (request, response, next) => {
        // TODO the input params for parent commits used to be an array of objects rather than the correct
        // array of strings. To maintain backwards compatibility we support both inputs.
        const createCommitParams = request.body as ICreateCommitParams;
        if (createCommitParams.parents &&
            createCommitParams.parents.length > 0 &&
            typeof(createCommitParams.parents[0]) !== "string") {
            createCommitParams.parents = createCommitParams.parents.map((value) => {
                return (value as any as ICommitHash).sha;
            });
        }

        const commitP = provider.gitService.createCommit(request.params.owner, request.params.repo, request.body);
        utils.handleResponse(
            commitP,
            response,
            false,
            201);
    });

    router.get(provider.translatePath("/repos/:owner?/:repo/git/commits/:sha"), (request, response, next) => {
        const useCache = !("disableCache" in request.query);
        const commitP = provider.gitService.getCommit(
            request.params.owner,
            request.params.repo,
            request.params.sha,
            useCache);
        utils.handleResponse(commitP, response, useCache);
    });

    return router;
}
