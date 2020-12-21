/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { parse } from "url";
import _ from "lodash";
import { IFluidCodeDetails } from "@fluidframework/core-interfaces";
import { ScopeType } from "@fluidframework/protocol-definitions";
import { IAlfredTenant } from "@fluidframework/server-services-client";
import { extractPackageIdentifierDetails, SemVerCdnCodeResolver } from "@fluidframework/web-code-loader";
import { IFluidResolvedUrl } from "@fluidframework/driver-definitions";
import { Router } from "express";
import safeStringify from "json-stringify-safe";
import jwt from "jsonwebtoken";
import { Provider } from "nconf";
import { v4 } from "uuid";
import winston from "winston";
import dotenv from "dotenv";
import { spoEnsureLoggedIn } from "../gatewayOdspUtils";
import { FullTree, resolveR11sUrl, resolveSpoUrl } from "../gatewayUrlResolver";
import { IAlfred, IKeyValueWrapper } from "../interfaces";
import { getConfig, getJWTClaims, getUserDetails, queryParamAsString, getR11sToken } from "../utils";
import { isSpoTenant } from "../odspUtils";
import { defaultPartials } from "./partials";
import { getUser, IExtendedUser } from "./utils";

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

    // FRS
    const blobStorage = config.get("worker:frsBlobStorageUrl");
    const serverUrl = config.get("worker:frsServerUrl");
    if (blobStorage !== undefined && serverUrl !== undefined) {
        config.set("worker:blobStorageUrl", blobStorage);
        config.set("worker:serverUrl", serverUrl);
    }

    /**
     * Loading of a specific Fluid document.
     */
    router.get("/:tenantId/*", spoEnsureLoggedIn(), ensureLoggedIn(), (request, response) => {
        const start = Date.now();
        const chaincode: string = queryParamAsString(request.query.chaincode);
        const claims = getJWTClaims(request);
        const hostToken = jwt.sign(claims, jwtKey);

        const rawPath = request.params[0];
        const slash = rawPath.indexOf("/");
        const documentId = rawPath.substring(0, slash !== -1 ? slash : rawPath.length);
        const path = rawPath.substring(slash !== -1 ? slash : rawPath.length);

        const tenantId = request.params.tenantId;

        const search = parse(request.url).search;
        const scopes = [ScopeType.DocRead, ScopeType.DocWrite, ScopeType.SummaryWrite];
        const user = getUser(request);
        let fullTreeP: Promise<undefined | FullTree>;
        let resolvedP: Promise<IFluidResolvedUrl>;
        const isSpoTenantPath = isSpoTenant(tenantId);
        let r11sAccessToken = "";
        if (isSpoTenantPath) {
            [resolvedP, fullTreeP] =
                resolveSpoUrl(config, tenantId, documentId, request);
        } else {
            r11sAccessToken = getR11sToken(
                tenantId, documentId, appTenants, scopes, user as IExtendedUser);
            [resolvedP, fullTreeP] =
                resolveR11sUrl(config, alfred, tenantId, documentId, r11sAccessToken, request);
        }

        const workerConfig = getConfig(
            config.get("worker"),
            tenantId,
            config.get("error:track"));

        const pkgP = fullTreeP.then((fullTree) => {
            if (fullTree && fullTree.code) {
                return codeResolver.resolveCodeDetails(fullTree.code);
            }

            if (request.query.chaincode === undefined) {
                return;
            }

            // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
            const cdn = request.query.cdn ? request.query.cdn : config.get("worker:npm");
            const entryPoint = queryParamAsString(request.query.entrypoint);

            let codeDetails: IFluidCodeDetails;
            if (chaincode.startsWith("http")) {
                codeDetails = {
                    config: {
                        [`@gateway:cdn`]: chaincode,
                    },
                    package: {
                        fluid: {
                            browser: {
                                umd: {
                                    files: [chaincode],
                                    library: entryPoint,
                                },
                            },
                        },
                        name: `@gateway/${v4()}`,
                        version: "0.0.0",
                    },
                };
            } else {
                const details = extractPackageIdentifierDetails(chaincode);
                codeDetails = {
                    config: {
                        [`@${details.scope}:cdn`]: cdn,
                    },
                    package: chaincode,
                };
            }

            return codeResolver.resolveCodeDetails(codeDetails);
        });

        const scriptsP = pkgP.then((pkg) => {
            if (pkg === undefined) {
                return [];
            }

            const umd = pkg.resolvedPackage.fluid?.browser?.umd;
            if (umd === undefined) {
                return [];
            }

            return {
                entrypoint: umd.library,
                scripts: umd.files.map(
                    (script, index) => {
                        return {
                            id: `${pkg.resolvedPackageCacheId}-${index}`,
                            url: script,
                        };
                    }),
            };
        });

        // Track timing
        const treeTimeP = fullTreeP.then(() => Date.now() - start);
        const pkgTimeP = pkgP.then(() => Date.now() - start);
        const timingsP = Promise.all([treeTimeP, pkgTimeP]);

        Promise.all([resolvedP, fullTreeP, pkgP, scriptsP, timingsP])
            .then(([resolved, fullTree, pkg, scripts, timings]) => {
                // Bug in TS3.7: https://github.com/microsoft/TypeScript/issues/33752
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                resolved!.url += path + (search ?? "");
                winston.info(`render ${tenantId}/${documentId} +${Date.now() - start}`);

                // Bug in TS3.7: https://github.com/microsoft/TypeScript/issues/33752
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                timings!.push(Date.now() - start);
                const configClientId = config.get("login:microsoft").clientId;
                response.render(
                    "loader",
                    {
                        cache: fullTree ? JSON.stringify(fullTree.cache) : undefined,
                        chaincode: JSON.stringify(pkg),
                        clientId: _.isEmpty(configClientId)
                            ? process.env.MICROSOFT_CONFIGURATION_CLIENT_ID : configClientId,
                        config: workerConfig,
                        isSpoTenantPath,
                        hostToken,
                        accessToken: r11sAccessToken,
                        partials: defaultPartials,
                        resolved: JSON.stringify(resolved),
                        scripts,
                        timings: JSON.stringify(timings),
                        title: documentId,
                        user: getUserDetails(request),
                    });
            }, (error) => {
                response.status(400).end(`ERROR: ${error.stack}\n${safeStringify(error, undefined, 2)}`);
            }).catch((error) => {
                response.status(500).end(`ERROR: ${error.stack}\n${safeStringify(error, undefined, 2)}`);
            });
    });

    return router;
}
