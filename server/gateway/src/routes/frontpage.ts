/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ScopeType } from "@microsoft/fluid-protocol-definitions";
import { IAlfredTenant } from "@microsoft/fluid-server-services-client";
import { Router } from "express";
import * as safeStringify from "json-stringify-safe";
import * as jwt from "jsonwebtoken";
import { Provider } from "nconf";
import * as winston from "winston";
import { spoEnsureLoggedIn } from "../gatewayOdspUtils";
import { resolveUrl } from "../gatewayUrlResolver";
import { IAlfred, IKeyValueWrapper } from "../interfaces";
import { getConfig, getParam, getUserDetails } from "../utils";
import { defaultPartials } from "./partials";

export function create(
    config: Provider,
    alfred: IAlfred,
    appTenants: IAlfredTenant[],
    ensureLoggedIn: any,
    cache: IKeyValueWrapper): Router {

    const router: Router = Router();
    const jwtKey = config.get("gateway:key");

    /**
     * Looks up the frontpage document id in cache
     */
    async function getDocId(): Promise<string> {
        const docKey = "frontpage";
        return new Promise<string>((resolve) => {
            cache.get(docKey).then((value) => {
                resolve(value as string);
            }, (err) => {
                winston.error(err);
                resolve(undefined);
            });
        });
    }

    /**
     * Loading of a specific fluid document.
     */
    router.get("/:docId?", spoEnsureLoggedIn(), ensureLoggedIn(), async (request, response) => {
        // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
        const docId = getParam(request.params, "docId") || await getDocId();
        winston.info(`Loading FrontPage from ${docId}`);
        if (docId === undefined) {
            response.status(500).end("No document found");
        } else {
            const tenantId = "prague";
            const jwtToken = jwt.sign(
                {
                    user: request.user,
                },
                jwtKey);
            const scopes = [ScopeType.DocRead];
            const [resolvedP, fullTreeP] = resolveUrl(config, alfred, appTenants, tenantId, docId, scopes, request);

            const workerConfig = getConfig(
                config.get("worker"),
                tenantId,
                config.get("error:track"));

            Promise.all([resolvedP, fullTreeP]).then(([resolved, fullTree]) => {
                response.render(
                    "frontpage",
                    {
                        // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
                        cache: fullTree ? JSON.stringify(fullTree.cache) : undefined,
                        config: workerConfig,
                        jwt: jwtToken,
                        npm: config.get("worker:npm"),
                        partials: defaultPartials,
                        resolved: JSON.stringify(resolved),
                        title: "FrontPage",
                        user: getUserDetails(request),
                    });
            }, (error) => {
                response.status(400).end(safeStringify(error, undefined, 2));
            }).catch((error) => {
                response.status(500).end(safeStringify(error, undefined, 2));
            });
        }
    });

    return router;
}
