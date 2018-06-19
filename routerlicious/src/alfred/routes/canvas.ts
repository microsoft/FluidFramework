import { Router } from "express";
import { Provider } from "nconf";
import { ITenantManager } from "../../api-core";
import * as storage from "../storage";
import { IAlfredTenant } from "../tenant";
import * as utils from "../utils";
import { defaultPartials } from "./partials";

export function create(config: Provider, tenantManager: ITenantManager,
                       appTenants: IAlfredTenant[], ensureLoggedIn: any): Router {
    const router: Router = Router();

    /**
     * Loading of a specific collaborative map
     */
    router.get("/:tenantId?/:id", ensureLoggedIn(), async (request, response, next) => {
        const tenantId = request.params.tenantId || appTenants[0].id;

        const workerConfigP = utils.getConfig(
            config.get("worker"),
            tenantManager,
            tenantId,
            config.get("error:track"),
            config.get("client"));
        const versionP = storage.getLatestVersion(
            tenantManager,
            tenantId,
            request.params.id);
        const token = utils.getToken(tenantId, request.params.id, appTenants);

        Promise.all([workerConfigP, versionP]).then((values) => {
            response.render(
                "canvas",
                {
                    config: values[0],
                    documentId: request.params.id,
                    partials: defaultPartials,
                    tenantId,
                    title: request.params.id,
                    token,
                    version: JSON.stringify(values[1]),
                });
        }, (error) => {
            response.status(400).json(error);
        });

    });

    return router;
}
