import { Router } from "express";
import * as git from "gitresources";
import * as nconf from "nconf";
import * as utils from "../utils";

export function create(store: nconf.Provider, gitService: git.IGitService): Router {
    const router: Router = Router();

    router.get("/repos/:repo/contents/*", (request, response, next) => {
        const contentP = gitService.getContent(request.params.repo, request.params[0], request.query.ref);
        utils.handleResponse(
            contentP,
            response,
            false);
    });

    return router;
}
