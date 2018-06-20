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
     * Loads count number of latest commits.
     */
    router.get("/:tenantId?/:id/commits", ensureLoggedIn(), (request, response, next) => {
        const tenantId = request.params.tenantId || appTenants[0].id;
        const versionsP = storage.getVersions(tenantManager, tenantId, request.params.id, 30);

        versionsP.then(
            (versions) => {
                response.render(
                    "commits",
                    {
                        documentId: request.params.id,
                        partials: defaultPartials,
                        tenantId,
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
    router.get("/:tenantId?/:id/commit", ensureLoggedIn(), async (request, response, next) => {
        const tenantId = request.params.tenantId || appTenants[0].id;

        const targetVersionSha = request.query.version;
        const workerConfigP = utils.getConfig(
            config.get("worker"),
            tenantManager,
            tenantId,
            config.get("error:track"),
            config.get("client"));
        const versionsP = storage.getVersion(
            tenantManager,
            request.params.tenantid,
            request.params.id,
            targetVersionSha);
        const token = utils.getToken(tenantId, request.params.id, appTenants);

        Promise.all([workerConfigP, versionsP]).then((values) => {
            response.render(
                "maps",
                {
                    config: values[0],
                    documentId: request.params.id,
                    loadPartial: true,
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
        const versionP = storage.getLatestVersion(tenantManager, tenantId, request.params.id);
        const token = utils.getToken(tenantId, request.params.id, appTenants);

        Promise.all([workerConfigP, versionP]).then((values) => {
            response.render(
                "maps",
                {
                    config: values[0],
                    documentId: request.params.id,
                    loadPartial: false,
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
