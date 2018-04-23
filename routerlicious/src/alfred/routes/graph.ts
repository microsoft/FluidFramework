import { Router } from "express";
import { Provider } from "nconf";
import { ITenantManager } from "../../api-core";
import * as storage from "../storage";
import { IAlfredTenant } from "../tenant";
import * as utils from "../utils";
import { defaultPartials } from "./partials";

export function create(config: Provider, tenantManager: ITenantManager, appTenants: IAlfredTenant[]): Router {
    const router: Router = Router();

    /**
     * Loading of a graph demo
     */
    router.get("/:tenantId?/:id", async (request, response, next) => {
        const workerConfigP = utils.getConfig(config.get("worker"), tenantManager, request.params.tenantId);
        const versionP = storage.getLatestVersion(tenantManager, request.params.tenantId, request.params.id);
        const token = utils.getToken(request.params.tenantId, request.params.id, appTenants);

        Promise.all([workerConfigP, versionP]).then((values) => {
            response.render(
                "graph",
                {
                    config: values[0],
                    documentId: request.params.id,
                    partials: defaultPartials,
                    tenantId: request.params.tenantId,
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
