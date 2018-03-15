// Load environment varaibles and pass to the controller.
import { Router } from "express";
import { Provider } from "nconf";
import { ITenantManager } from "../../api-core";
import * as storage from "../storage";
import * as utils from "../utils";
import { defaultPartials } from "./partials";

export function create(config: Provider, tenantManager: ITenantManager): Router {
    const router: Router = Router();

    /**
     * Loads count number of latest commits.
     */
    router.get("/:tenantId?/:id/commits", (request, response, next) => {
        const id = utils.getFullId(request.params.tenantId, request.params.id);
        const versionsP = storage.getVersions(tenantManager, request.params.tenantId, request.params.id, 30);

        versionsP.then(
            (versions) => {
                response.render(
                    "commits",
                    {
                        id,
                        partials: defaultPartials,
                        type: "maps",
                        versions: JSON.stringify(versions),
                    });
            },
            (error) => {
                response.status(400).json(error);
            });
    });

    /**
     * Loading of a specific version of shared text.
     */
    router.get("/:tenantId?/:id/commit", async (request, response, next) => {
        const id = utils.getFullId(request.params.tenantId, request.params.id);

        const targetVersionSha = request.query.version;
        const workerConfig = await utils.getConfig(config.get("worker"), tenantManager, request.params.tenantId);
        const versionsP = storage.getVersion(
            tenantManager,
            request.params.tenantid,
            request.params.id,
            targetVersionSha);

        versionsP.then(
            (version) => {
                response.render(
                    "maps",
                    {
                        config: workerConfig,
                        id,
                        loadPartial: true,
                        partials: defaultPartials,
                        title: request.params.id,
                        version: JSON.stringify(version),
                    });
            },
            (error) => {
                response.status(400).json(error);
            });
    });

    /**
     * Loading of a specific collaborative map
     */
    router.get("/:tenantId?/:id", async (request, response, next) => {
        const id = utils.getFullId(request.params.tenantId, request.params.id);

        const workerConfig = await utils.getConfig(config.get("worker"), tenantManager, request.params.tenantId);
        const versionP = storage.getLatestVersion(tenantManager, request.params.tenantId, request.params.id);

        versionP.then(
            (version) => {
                response.render(
                    "maps",
                    {
                        config: workerConfig,
                        id,
                        loadPartial: false,
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
