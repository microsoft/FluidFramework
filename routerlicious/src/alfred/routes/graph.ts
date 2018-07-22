import { Router } from "express";
import { Provider } from "nconf";
import { IDocumentStorage, ITenantManager } from "../../core";
import { IAlfredTenant } from "../tenant";
import * as utils from "../utils";
import { defaultPartials } from "./partials";

export function create(
    config: Provider,
    tenantManager: ITenantManager,
    storage: IDocumentStorage,
    appTenants: IAlfredTenant[],
    ensureLoggedIn: any): Router {

    const router: Router = Router();

    /**
     * Loading of a graph demo
     */
    router.get("/:tenantId?/:id", ensureLoggedIn(), async (request, response, next) => {
        const tenantId = request.params.tenantId || appTenants[0].id;

        const workerConfigP = utils.getConfig(
            config.get("worker"),
            tenantManager,
            tenantId,
            config.get("error:track"),
            config.get("client"));
        const versionP = storage.getLatestVersion(tenantId, request.params.id);
        const token = utils.getToken(tenantId, request.params.id, appTenants);

        Promise.all([workerConfigP, versionP]).then((values) => {
            response.render(
                "graph",
                {
                    config: values[0],
                    documentId: request.params.id,
                    partials: defaultPartials,
                    tenantId,
                    title: request.params.id,
                    token,
                    version: JSON.stringify(values[1]),
                });
        },
        (error) => {
            response.status(400).json(error);
        });
    });

    return router;
}
