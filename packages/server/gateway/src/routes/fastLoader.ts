/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IFluidResolvedUrl, ScopeType } from "@microsoft/fluid-protocol-definitions";
import { IAlfredTenant, ICache } from "@microsoft/fluid-server-services-core";
import { Router } from "express";
import * as safeStringify from "json-stringify-safe";
import * as jwt from "jsonwebtoken";
import { Provider } from "nconf";
import { parse } from "url";
import * as winston from "winston";
import { getConfig, getParam, getToken, getUserDetails, IAlfredUser } from "../utils";
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

        const rawPath =  request.params[0] as string;
        const slash = rawPath.indexOf("/");
        const documentId = rawPath.substring(0, slash !== -1 ? slash : rawPath.length);
        const path = rawPath.substring(slash !== -1 ? slash : rawPath.length);

        const tenantId = getParam(request.params, "tenantId");
        const chaincode = request.query.chaincode;

        const user: IAlfredUser = (request.user) ? {
            displayName: request.user.name,
            id: request.user.oid,
            name: request.user.name,
        } : undefined;

        const scopes = [ScopeType.DocRead, ScopeType.DocWrite, ScopeType.SummaryWrite];
        const token = getToken(tenantId, documentId, appTenants, scopes, user);

        const fluidUrl = "fluid://" +
        `${parse(config.get("worker:serverUrl")).host}/` +
        `${encodeURIComponent(tenantId)}/` +
        `${encodeURIComponent(documentId)}` +
        path;

        const deltaStorageUrl =
            config.get("worker:serverUrl") +
            "/deltas" +
            `/${encodeURIComponent(tenantId)}/${encodeURIComponent(documentId)}`;

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

        const emptyCache = {
            blobs: [],
            commits: [],
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
                            cache: JSON.stringify(null),
                            chaincode: null,
                            config: workerConfig,
                            jwt: jwtToken,
                            partials: defaultPartials,
                            pkg: null,
                            resolved: JSON.stringify(null),
                            timings: JSON.stringify(null),
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
