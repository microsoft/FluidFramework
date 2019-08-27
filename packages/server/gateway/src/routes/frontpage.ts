/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ScopeType } from "@prague/protocol-definitions";
import { IAlfredTenant } from "@prague/services-core";
import { Router } from "express";
import * as safeStringify from "json-stringify-safe";
import * as jwt from "jsonwebtoken";
import * as _ from "lodash";
import { Provider } from "nconf";
import * as winston from "winston";
import { spoEnsureLoggedIn } from "../gateway-odsp-utils";
import { resolveUrl } from "../gateway-urlresolver";
import { IAlfred } from "../interfaces";
import { IKeyValue } from "../keyValueLoader";
import { getConfig, getParam, getUserDetails } from "../utils";
import { defaultPartials } from "./partials";

export function create(
    config: Provider,
    alfred: IAlfred,
    appTenants: IAlfredTenant[],
    ensureLoggedIn: any,
    cacheP: Promise<IKeyValue>): Router {

    const router: Router = Router();
    const jwtKey = config.get("gateway:key");

    /**
     * Looks up the frontpage document id in cache
     */
    async function getDocId(): Promise<string> {
        const docKey = "frontpage";
        return new Promise<string>((resolve) => {
            cacheP.then((cache) => {
                resolve(cache.get(docKey) as string);
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
