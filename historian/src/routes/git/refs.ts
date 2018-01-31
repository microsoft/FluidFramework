import { Router } from "express";
import * as nconf from "nconf";
import { StorageProvider } from "../../services";
import * as utils from "../utils";

export function create(store: nconf.Provider, provider: StorageProvider): Router {
    const router: Router = Router();

    router.get(provider.translatePath("/repos/:repo/git/refs"), (request, response, next) => {
        const refsP = provider.historian.getRefs(request.params.repo);
        utils.handleResponse(
            refsP,
            response,
            false);
    });

    router.get(provider.translatePath("/repos/:repo/git/refs/*"), (request, response, next) => {
        const refP = provider.historian.getRef(request.params.repo, request.params[0]);
        utils.handleResponse(
            refP,
            response,
            false);
    });

    router.post(provider.translatePath("/repos/:repo/git/refs"), (request, response, next) => {
        const refP = provider.historian.createRef(request.params.repo, request.body);
        utils.handleResponse(
            refP,
            response,
            false,
            201);
    });

    router.patch(provider.translatePath("/repos/:repo/git/refs/*"), (request, response, next) => {
        const refP = provider.historian.updateRef(request.params.repo, request.params[0], request.body);
        utils.handleResponse(
            refP,
            response,
            false);
    });

    router.delete(provider.translatePath("/repos/:repo/git/refs/*"), (request, response, next) => {
        const refP = provider.historian.deleteRef(request.params.repo, request.params[0]);
        utils.handleResponse(
            refP,
            response,
            false,
            204);
    });

    return router;
}
