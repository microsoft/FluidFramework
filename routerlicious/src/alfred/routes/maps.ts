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
        const versionsP = storage.getVersions(tenantManager, request.params.tenantId, request.params.id, 30);

        versionsP.then(
            (versions) => {
                response.render(
                    "commits",
                    {
                        documentId: request.params.id,
                        partials: defaultPartials,
                        tenantId: request.params.tenantId,
                        type: "maps",
                        versions: JSON.stringify(versions),
                    });
        }, (error) => {
            response.status(400).json(error);
        });
    });

    /**
     * Loading of a specific version of shared text.
     */
    router.get("/:tenantId?/:id/commit", async (request, response, next) => {
        const targetVersionSha = request.query.version;
        const workerConfigP = utils.getConfig(config.get("worker"), tenantManager, request.params.tenantId);
        const versionsP = storage.getVersion(
            tenantManager,
            request.params.tenantid,
            request.params.id,
            targetVersionSha);

        Promise.all([workerConfigP, versionsP]).then((values) => {
            response.render(
                "maps",
                {
                    config: values[0],
                    documentId: request.params.id,
                    loadPartial: true,
                    partials: defaultPartials,
                    tenantId: request.params.tenantId,
                    title: request.params.id,
                    version: JSON.stringify(values[1]),
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
        const workerConfigP = utils.getConfig(config.get("worker"), tenantManager, request.params.tenantId);
        const versionP = storage.getLatestVersion(tenantManager, request.params.tenantId, request.params.id);

        Promise.all([workerConfigP, versionP]).then((values) => {
            response.render(
                "maps",
                {
                    config: values[0],
                    documentId: request.params.id,
                    loadPartial: false,
                    partials: defaultPartials,
                    tenantId: request.params.tenantId,
                    title: request.params.id,
                    version: JSON.stringify(values[1]),
                });
        }, (error) => {
            response.status(400).json(error);
        });
    });

    return router;
}
