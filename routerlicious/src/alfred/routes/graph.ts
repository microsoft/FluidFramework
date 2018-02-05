import { Router } from "express";
import { Provider } from "nconf";
import { ITenantManager } from "../../api-core";
import * as storage from "../storage";
import * as utils from "../utils";
import { defaultPartials } from "./partials";

export function create(config: Provider, tenantManager: ITenantManager): Router {
    const router: Router = Router();

    /**
     * Loading of a graph demo
     */
    router.get("/:tenantId/:id", (request, response, next) => {
        const id = utils.getFullId(request.params.tenantId, request.params.id);

        const workerConfig = utils.getConfig(config.get("worker"), tenantManager, request.params.tenantId);
        const versionP = storage.getLatestVersion(tenantManager, request.params.tenantId, request.params.id);

        versionP.then(
            (version) => {
                response.render(
                    "graph",
                    {
                        config: workerConfig,
                        id,
                        partials: defaultPartials,
                        title: request.params.id,
                        version: JSON.stringify(version),
                    });
            },
            (error) => {
                response.status(400).json(error);
            });
    });

    return router;
}
