import { Router } from "express";
import * as nconf from "nconf";
import * as services from "../../services";
import * as utils from "../utils";

export function create(store: nconf.Provider, gitService: services.IHistorian): Router {
    const router: Router = Router();

    router.get("/repos/:repo/headers/:sha", (request, response, next) => {
        const headerP = gitService.getCommit(request.params.repo, request.params.sha)
            .then((commit) => gitService.getHeader(request.params.repo, commit));
        utils.handleResponse(headerP, response);
    });

    return router;
}
