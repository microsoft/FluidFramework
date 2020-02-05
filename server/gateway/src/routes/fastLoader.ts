/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { parse } from "url";
import { IFluidResolvedUrl } from "@microsoft/fluid-driver-definitions";
import { ScopeType } from "@microsoft/fluid-protocol-definitions";
import { getR11sToken, IAlfredUser } from "@microsoft/fluid-routerlicious-urlresolver";
import { IAlfredTenant } from "@microsoft/fluid-server-services-client";
import { ICache } from "@microsoft/fluid-server-services-core";
import { Router } from "express";
import * as safeStringify from "json-stringify-safe";
import * as jwt from "jsonwebtoken";
import { Provider } from "nconf";
import * as winston from "winston";
import { getConfig, getParam, getUserDetails } from "../utils";
import { defaultPartials } from "./partials";

function createLoaderScript(
    loaderUrl: string,
    resolved: IFluidResolvedUrl,
    cache: any,
    workerConfig: string,
    chainCode: string,
    scriptIds: string[],
    npm: string,
    userJwt: string) {
    const scriptCode = `
    <script src="${loaderUrl}"></script>
    <script>
        console.log("Cached page rendered");
        loader.initialize(
            window.location.href,
            ${JSON.stringify(resolved)},
            ${JSON.stringify(cache)},
            ${workerConfig},
            "${chainCode}",
            null,
            ${JSON.stringify(scriptIds)},
            "${npm}",
            "${userJwt}");
    </script>
    `;
    return scriptCode;
}

export function create(
    config: Provider,
    cache: ICache,
    appTenants: IAlfredTenant[],
    ensureLoggedIn: any,
    urlResolver: (id: string) => string,
): Router {
    const router: Router = Router();
    const jwtKey = config.get("gateway:key");

    /**
     * Loading of a specific shared text.
     */
    router.get("/:tenantId/*", ensureLoggedIn(), async (request, response) => {
        const jwtToken = jwt.sign(
            {
                user: request.user,
            },
            jwtKey);

        const rawPath =  request.params[0];
        const slash = rawPath.indexOf("/");
        const documentId = rawPath.substring(0, slash !== -1 ? slash : rawPath.length);
        const path = rawPath.substring(slash !== -1 ? slash : rawPath.length);

        const tenantId = getParam(request.params, "tenantId");
        const chaincode = request.query.chaincode;

        // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
        const user: IAlfredUser = (request.user) ? {
            displayName: request.user.name,
            id: request.user.oid,
            name: request.user.name,
        } : undefined;

        const scopes = [ScopeType.DocRead, ScopeType.DocWrite, ScopeType.SummaryWrite];
        const token = getR11sToken(tenantId, documentId, appTenants, scopes, user);

        const fluidUrl =
            `fluid://\
            ${parse(config.get("worker:serverUrl")).host}\
            /${encodeURIComponent(tenantId)}\
            /${encodeURIComponent(documentId)}\
            ${path}`;

        const deltaStorageUrl =
            `${config.get("worker:serverUrl")}\
            /deltas/\
            ${encodeURIComponent(tenantId)}/${encodeURIComponent(documentId)}`;

        const storageUrl =
            `${config.get("worker:blobStorageUrl").replace("historian:3000", "localhost:3001")}\
            /repos/\
            ${encodeURIComponent(tenantId)}`;

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

        const emptyCache = {
            blobs: [],
            commits: [],
            // eslint-disable-next-line no-null/no-null
            refs: { [documentId]: null },
            trees: [],
        };

        const workerConfig = getConfig(
            config.get("worker"),
            tenantId,
            config.get("error:track"));

        const packageUrl = config.get("worker:npm");
        const pageKey = `${tenantId}-${documentId}`;
        const cachedPageP = cache.get(pageKey);
        cachedPageP.then(
            (page) => {
                // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
                if (page) {
                    const loaderUrl = urlResolver(`/public/scripts/dist/loader.js`);
                    winston.info(`Sending page ${pageKey} with ${loaderUrl}`);
                    const scriptCode = createLoaderScript(
                        loaderUrl,
                        resolved,
                        emptyCache,
                        workerConfig,
                        chaincode,
                        [],
                        packageUrl,
                        jwtToken,
                    );
                    const pageWithCode = page.concat(scriptCode);
                    response.send(pageWithCode);
                } else {
                    response.render(
                        "loader",
                        {
                            cache: "null",
                            // eslint-disable-next-line no-null/no-null
                            chaincode: null,
                            config: workerConfig,
                            jwt: jwtToken,
                            partials: defaultPartials,
                            // eslint-disable-next-line no-null/no-null
                            pkg: null,
                            resolved: "null",
                            timings: "null",
                            title: documentId,
                            user: getUserDetails(request),
                            token,
                        });
                }
            },
            (err) => {
                response.status(400).end(safeStringify(err));
            });
    });
    return router;
}
