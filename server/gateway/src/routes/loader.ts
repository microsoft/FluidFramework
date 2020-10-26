/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { parse } from "url";
import _ from "lodash";
import { ScopeType } from "@fluidframework/protocol-definitions";
import { IAlfredTenant } from "@fluidframework/server-services-client";
import { SemVerCdnCodeResolver } from "@fluidframework/web-code-loader";
import { Router } from "express";
import safeStringify from "json-stringify-safe";
import jwt from "jsonwebtoken";
import { Provider } from "nconf";
import winston from "winston";
import dotenv from "dotenv";
import { getFluidObjectBundle, spoEnsureLoggedIn } from "../gatewayOdspUtils";
import { resolveUrl } from "../gatewayUrlResolver";
import { IAlfred, IKeyValueWrapper } from "../interfaces";
import { getConfig, getJWTClaims, getUserDetails, queryParamAsString } from "../utils";
import { defaultPartials } from "./partials";

dotenv.config();

export function create(
    config: Provider,
    alfred: IAlfred,
    appTenants: IAlfredTenant[],
    ensureLoggedIn: any,
    cache: IKeyValueWrapper): Router {
    const router: Router = Router();
    const jwtKey = config.get("gateway:key");
    const codeResolver = new SemVerCdnCodeResolver();

    /**
     * Looks up the version of a chaincode in the cache.
     */
    const getUrlWithVersion = async (chaincode: string) => {
        return new Promise<string>((resolve) => {
            if (chaincode !== "" && chaincode.indexOf("@") === chaincode.lastIndexOf("@")) {
                cache.get(chaincode).then((value) => {
                    resolve(value as string);
                }, (err) => {
                    winston.error(err);
                    resolve(undefined);
                });
            } else {
                resolve(undefined);
            }
        });
    };

    /**
     * Loading of a specific Fluid document.
     */
    router.get("/:tenantId/*", spoEnsureLoggedIn(), ensureLoggedIn(), (request, response) => {
        const start = Date.now();
        const chaincode: string | undefined = queryParamAsString(request.query.chaincode);
        const driveId: string | undefined = queryParamAsString(request.query.driveId);
        const entrypoint: string | undefined = queryParamAsString(request.query.entrypoint);
        const spScriptId: string | undefined = queryParamAsString(request.query.spScriptId);
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        getUrlWithVersion(chaincode).then((version: string) => {
            if (version) {
                const redirectUrl = `${request.originalUrl}@${version}`;
                winston.info(`Redirecting to ${redirectUrl}`);
                response.redirect(redirectUrl);
            } else {
                const claims = getJWTClaims(request);
                const jwtToken = jwt.sign(claims, jwtKey);

                const rawPath = request.params[0];
                const slash = rawPath.indexOf("/");
                const documentId = rawPath.substring(0, slash !== -1 ? slash : rawPath.length);
                const path = rawPath.substring(slash !== -1 ? slash : rawPath.length);

                const tenantId = request.params.tenantId;

                const search = parse(request.url).search;
                const scopes = [ScopeType.DocRead, ScopeType.DocWrite, ScopeType.SummaryWrite];
                const [resolvedP, fullTreeP] =
                    resolveUrl(config, alfred, appTenants, tenantId, documentId, scopes, request, driveId);

                const workerConfig = getConfig(
                    config.get("worker"),
                    tenantId,
                    config.get("error:track"));

                const [pkgP, scriptsP] = getFluidObjectBundle(
                    request.url,
                    resolvedP,
                    fullTreeP,
                    codeResolver,
                    chaincode,
                    request.query.cdn === undefined ? request.query.cdn : config.get("worker:npm"),
                    entrypoint,
                    spScriptId,
                );

                // Track timing
                const treeTimeP = fullTreeP.then(() => Date.now() - start);
                const pkgTimeP = pkgP.then(() => Date.now() - start);
                const timingsP = Promise.all([treeTimeP, pkgTimeP]);

                Promise.all([resolvedP, fullTreeP, pkgP, scriptsP, timingsP])
                    .then(([resolved, fullTree, pkg, scripts, timings]) => {
                        // Bug in TS3.7: https://github.com/microsoft/TypeScript/issues/33752
                        if (resolved !== undefined && timings !== undefined) {
                            resolved.url += path + (search ?? "");
                            winston.info(`render ${tenantId}/${documentId} +${Date.now() - start}`);
                            winston.info(JSON.stringify(scripts));
                            timings.push(Date.now() - start);
                            const configClientId: string = config.get("login:microsoft").clientId;
                            response.render(
                                "loader",
                                {
                                    cache: fullTree !== undefined ? JSON.stringify(fullTree.cache) : undefined,
                                    chaincode: JSON.stringify(pkg),
                                    clientId: _.isEmpty(configClientId)
                                    ? process.env.MICROSOFT_CONFIGURATION_CLIENT_ID : configClientId,
                                    config: workerConfig,
                                    jwt: jwtToken,
                                    partials: defaultPartials,
                                    resolved: JSON.stringify(resolved),
                                    scripts,
                                    timings: JSON.stringify(timings),
                                    title: documentId,
                                    user: getUserDetails(request),
                                },
                            );
                        } else {
                            throw Error("Failed to render the Gateway loader");
                        }
                    }, (error) => {
                        response.status(400).end(`ERROR: ${error.stack}\n${safeStringify(error, undefined, 2)}`);
                    }).catch((error) => {
                        response.status(500).end(`ERROR: ${error.stack}\n${safeStringify(error, undefined, 2)}`);
                    });
            }
        });
    });

    return router;
}
