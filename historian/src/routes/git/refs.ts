import { Router } from "express";
import * as nconf from "nconf";
import * as services from "../../services";
import * as utils from "../utils";

export function create(store: nconf.Provider, gitService: services.IGitService, cacheService: services.ICache): Router {
    const router: Router = Router();

    router.get("/repos/:repo/git/refs", (request, response, next) => {
        const refsP = gitService.getRefs(request.params.repo);
        utils.handleResponse(
            refsP,
            response,
            (refs) => {
                return refs;
            });
    });

    router.get("/repos/:repo/git/refs/*", (request, response, next) => {
        const refP = gitService.getRef(request.params.repo, request.params[0]);
        utils.handleResponse(
            refP,
            response,
            (ref) => {
                return ref;
            });
    });

    router.post("/repos/:repo/git/refs", (request, response, next) => {
        const refP = gitService.createRef(request.params.repo, request.body);
        utils.handleResponse(
            refP,
            response,
            (ref) => {
                return ref;
            },
            201);
    });

    router.patch("/repos/:repo/git/refs/*", (request, response, next) => {
        const refP = gitService.updateRef(request.params.repo, request.params[0], request.body);
        utils.handleResponse(
            refP,
            response,
            (ref) => {
                return ref;
            });
    });

    router.delete("/repos/:repo/git/refs/*", (request, response, next) => {
        const refP = gitService.deleteRef(request.params.repo, request.params[0]);
        utils.handleResponse(
            refP,
            response,
            (ref) => {
                return ref;
            },
            204);
    });

    return router;
}
