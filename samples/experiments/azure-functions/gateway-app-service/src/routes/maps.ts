/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IFluidResolvedUrl } from "@prague/container-definitions";
import { IAlfredTenant } from "@microsoft/fluid-server-services-core";
import { Router } from "express";
import * as jwt from "jsonwebtoken";
import { Provider } from "nconf";
import { parse } from "url";
import * as utils from "../utils";
import { defaultPartials } from "./partials";

export function create(
    config: Provider,
    appTenants: IAlfredTenant[],
    ensureLoggedIn: any,
): Router {
    const router: Router = Router();

    /**
     * Loading of a specific shared map
     */
    router.get("/:tenantId?/:id", ensureLoggedIn(), async (request, response, next) => {
        const tenantId = request.params.tenantId || appTenants[0].id;

        const jwtToken = jwt.sign(
            {
                user: request.user,
            },
            config.get("gateway:key"));

        const workerConfig = utils.getConfig(
            config.get("worker"),
            tenantId,
            config.get("error:track"));

        const user: utils.IAlfredUser = (request.user) ? {
            displayName: request.user.name,
            id: request.user.oid,
            name: request.user.name,
        } : undefined;

        const token = utils.getToken(tenantId, request.params.id, appTenants, user);
        const fluidUrl = "fluid://" +
            `${parse(config.get("worker:serverUrl")).host}/` +
            `${encodeURIComponent(tenantId)}/` +
            `${encodeURIComponent(request.params.id)}`;

        const deltaStorageUrl =
            config.get("worker:serverUrl") +
            "/deltas" +
            `/${encodeURIComponent(tenantId)}/${encodeURIComponent(request.params.id)}`;

        const storageUrl =
            config.get("worker:blobStorageUrl").replace("historian:3000", "localhost:3001") +
            "/repos" +
            `/${encodeURIComponent(tenantId)}`;

        const resolved: IFluidResolvedUrl = {
            endpoints: {
                deltaStorageUrl,
                ordererUrl: config.get("worker:serverUrl"),
                storageUrl,
            },
            tokens: { jwt: token },
            type: "fluid",
            url: fluidUrl,
        };

        response.render(
            "maps",
            {
                config: workerConfig,
                jwt: jwtToken,
                loadPartial: false,
                partials: defaultPartials,
                resolved: JSON.stringify(resolved),
                title: request.params.id,
            });
    });

    return router;
}
