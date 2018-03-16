import { Router } from "express";
import { Provider } from "nconf";
import { ITenantManager } from "../../api-core";
import * as storage from "../storage";
import * as utils from "../utils";
import { defaultPartials } from "./partials";

export function create(config: Provider, tenantManager: ITenantManager): Router {
    const router: Router = Router();

    /**
     * Loading of a specific collaborative map
     */
    router.get("/:tenantId?/:id", async (request, response, next) => {
        const id = utils.getFullId(request.params.tenantId, request.params.id);

        const workerConfigP = utils.getConfig(config.get("worker"), tenantManager, request.params.tenantId);
        const versionP = storage.getLatestVersion(
            tenantManager,
            request.params.tenantId,
            request.params.id);

        Promise.all([workerConfigP, versionP]).then((values) => {
            response.render(
                "canvas",
                {
                    config: values[0],
                    id,
                    partials: defaultPartials,
                    title: request.params.id,
                    version: JSON.stringify(values[1]),
                });
        }, (error) => {
            response.status(400).json(error);
        });

    });

    return router;
}
