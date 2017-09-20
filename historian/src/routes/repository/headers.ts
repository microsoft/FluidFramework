import { Router } from "express";
import * as git from "gitresources";
import * as nconf from "nconf";
import * as utils from "../utils";

export function create(store: nconf.Provider, gitService: git.IHistorian): Router {
    const router: Router = Router();

    router.get("/repos/:repo/headers/:sha", (request, response, next) => {
        const headerP = gitService.getHeader(request.params.repo, request.params.sha);
        utils.handleResponse(headerP, response);
    });

    return router;
}
