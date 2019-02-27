import { IPragueResolvedUrl } from "@prague/container-definitions";
import { IAlfredTenant, IDocumentStorage, ITenantManager } from "@prague/services-core";
import { Router } from "express";
import * as jwt from "jsonwebtoken";
import { Provider } from "nconf";
import { parse } from "url";
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
     * Loading of a specific shared map
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

        const jwtToken = jwt.sign(
            {
                user: request.user,
            },
            config.get("alfred:key"));

        Promise.all([workerConfigP, versionP]).then((values) => {
            const pragueUrl = "prague://" +
                `${parse(config.get("worker:serverUrl")).host}/` +
                `${encodeURIComponent(tenantId)}/` +
                `${encodeURIComponent(request.params.id)}`;
            const resolved: IPragueResolvedUrl = {
                ordererUrl: config.get("worker:serverUrl"),
                storageUrl: config.get("worker:blobStorageUrl"),
                tokens: { jwt: token },
                type: "prague",
                url: pragueUrl,
            };

            response.render(
                "canvas",
                {
                    config: values[0],
                    jwt: jwtToken,
                    partials: defaultPartials,
                    resolved: JSON.stringify(resolved),
                    title: request.params.id,
                });
        }, (error) => {
            response.status(400).json(error);
        });

    });

    return router;
}
