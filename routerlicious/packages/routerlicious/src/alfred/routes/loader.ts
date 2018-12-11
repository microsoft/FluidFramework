import { IAlfredTenant, IDocumentStorage, ITenantManager } from "@prague/services-core";
import { Router } from "express";
import { Provider } from "nconf";
import { getConfig, getToken } from "../utils";
import { defaultPartials } from "./partials";

export function create(
    config: Provider,
    tenantManager: ITenantManager,
    storage: IDocumentStorage,
    appTenants: IAlfredTenant[],
    ensureLoggedIn: any): Router {

    const router: Router = Router();

    /**
     * Loading of a specific shared text.
     */
    router.get("/:tenantId?/:id", ensureLoggedIn(), async (request, response, next) => {
        const tenantId = request.params.tenantId || appTenants[0].id;
        const chaincode = request.query.chaincode;
        const from = Number.parseInt(request.query.from, 10);
        const to = Number.parseInt(request.query.to, 10);
        const unitIsTime = request.query.unit === "time";
        const token = getToken(tenantId, request.params.id, appTenants);

        const workerConfigP = getConfig(
            config.get("worker"),
            tenantManager,
            tenantId,
            config.get("error:track"),
            config.get("client"));

        const versionP = storage.getLatestVersion(tenantId, request.params.id);
        Promise.all([workerConfigP, versionP]).then(([workerConfig, version]) => {
            response.render(
                "loader",
                {
                    chaincode,
                    config: workerConfig,
                    documentId: request.params.id,
                    from,
                    partials: defaultPartials,
                    tenantId,
                    title: request.params.id,
                    to,
                    token,
                    unitIsTime,
                    version: JSON.stringify(version),
                });
            }, (error) => {
                response.status(400).json(error);
        });
    });

    return router;
}
